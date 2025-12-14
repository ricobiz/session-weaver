import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeployRequest {
  action: 'check' | 'deploy' | 'status' | 'logs';
  serviceId?: string;
}

interface RailwayProject {
  id: string;
  name: string;
}

interface RailwayService {
  id: string;
  name: string;
}

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';

async function railwayQuery(token: string, query: string, variables?: Record<string, any>) {
  const response = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Railway API error: ${response.status} - ${text}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(`Railway GraphQL error: ${data.errors[0]?.message || 'Unknown error'}`);
  }

  return data.data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RAILWAY_API_TOKEN = Deno.env.get('RAILWAY_API_TOKEN');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');

    if (!RAILWAY_API_TOKEN) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Railway API token not configured',
          action: 'configure_secret',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: DeployRequest = await req.json().catch(() => ({ action: 'check' }));
    const { action } = body;

    // ========================================
    // CHECK - Verify Railway connection
    // ========================================
    if (action === 'check') {
      try {
        // Get user info to verify token
        const userData = await railwayQuery(RAILWAY_API_TOKEN, `
          query {
            me {
              id
              email
              name
            }
          }
        `);

        // Get existing projects
        const projectsData = await railwayQuery(RAILWAY_API_TOKEN, `
          query {
            projects {
              edges {
                node {
                  id
                  name
                  services {
                    edges {
                      node {
                        id
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        `);

        const projects = projectsData.projects.edges.map((e: any) => ({
          id: e.node.id,
          name: e.node.name,
          services: e.node.services.edges.map((s: any) => ({
            id: s.node.id,
            name: s.node.name,
          })),
        }));

        // Find existing runner service
        const runnerProject = projects.find((p: any) => 
          p.name.toLowerCase().includes('automation') || 
          p.name.toLowerCase().includes('runner')
        );

        const runnerService = runnerProject?.services?.find((s: any) =>
          s.name.toLowerCase().includes('runner')
        );

        return new Response(
          JSON.stringify({
            success: true,
            connected: true,
            user: userData.me,
            projects,
            existingRunner: runnerService ? {
              projectId: runnerProject.id,
              serviceId: runnerService.id,
              name: runnerService.name,
            } : null,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            connected: false,
            error: error instanceof Error ? error.message : 'Failed to connect',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ========================================
    // DEPLOY - Create/update runner on Railway
    // ========================================
    if (action === 'deploy') {
      console.log('Starting Railway deployment...');

      // Step 1: Create project if doesn't exist
      let projectId: string;
      
      const existingProjects = await railwayQuery(RAILWAY_API_TOKEN, `
        query {
          projects {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      `);

      const automationProject = existingProjects.projects.edges.find(
        (e: any) => e.node.name === 'Automation-Runner'
      );

      if (automationProject) {
        projectId = automationProject.node.id;
        console.log('Using existing project:', projectId);
      } else {
        // Create new project
        const createResult = await railwayQuery(RAILWAY_API_TOKEN, `
          mutation($input: ProjectCreateInput!) {
            projectCreate(input: $input) {
              id
              name
            }
          }
        `, {
          input: {
            name: 'Automation-Runner',
            description: 'Playwright automation runner for session execution',
          }
        });

        projectId = createResult.projectCreate.id;
        console.log('Created new project:', projectId);
      }

      // Step 2: Get or create environment
      const projectData = await railwayQuery(RAILWAY_API_TOKEN, `
        query($projectId: String!) {
          project(id: $projectId) {
            environments {
              edges {
                node {
                  id
                  name
                }
              }
            }
            services {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
        }
      `, { projectId });

      const prodEnv = projectData.project.environments.edges.find(
        (e: any) => e.node.name === 'production'
      );
      const environmentId = prodEnv?.node.id;

      // Step 3: Check if service exists
      let serviceId: string;
      const existingService = projectData.project.services.edges.find(
        (e: any) => e.node.name === 'runner'
      );

      if (existingService) {
        serviceId = existingService.node.id;
        console.log('Using existing service:', serviceId);
      } else {
        // Create service from Docker image
        const serviceResult = await railwayQuery(RAILWAY_API_TOKEN, `
          mutation($input: ServiceCreateInput!) {
            serviceCreate(input: $input) {
              id
              name
            }
          }
        `, {
          input: {
            projectId,
            name: 'runner',
            source: {
              image: 'mcr.microsoft.com/playwright:v1.40.0-jammy',
            }
          }
        });

        serviceId = serviceResult.serviceCreate.id;
        console.log('Created service:', serviceId);
      }

      // Step 4: Set environment variables
      if (environmentId) {
        const variables = {
          API_BASE_URL: SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/session-api` : '',
          SUPABASE_ANON_KEY: SUPABASE_ANON_KEY || '',
          OPENROUTER_API_KEY: OPENROUTER_API_KEY || '',
          RUNNER_ID: `railway-${Date.now()}`,
          NODE_ENV: 'production',
          HEADLESS: 'true',
          MAX_CONCURRENT_SESSIONS: '3',
        };

        for (const [name, value] of Object.entries(variables)) {
          if (value) {
            await railwayQuery(RAILWAY_API_TOKEN, `
              mutation($input: VariableUpsertInput!) {
                variableUpsert(input: $input)
              }
            `, {
              input: {
                projectId,
                environmentId,
                serviceId,
                name,
                value,
              }
            });
          }
        }
        console.log('Environment variables set');
      }

      // Step 5: Trigger deployment
      const deployResult = await railwayQuery(RAILWAY_API_TOKEN, `
        mutation($serviceId: String!, $environmentId: String!) {
          serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId)
        }
      `, { serviceId, environmentId });

      console.log('Deployment triggered');

      return new Response(
        JSON.stringify({
          success: true,
          projectId,
          serviceId,
          environmentId,
          message: 'Runner deployment started on Railway',
          dashboardUrl: `https://railway.app/project/${projectId}`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // STATUS - Check deployment status
    // ========================================
    if (action === 'status' && body.serviceId) {
      const statusData = await railwayQuery(RAILWAY_API_TOKEN, `
        query($serviceId: String!) {
          service(id: $serviceId) {
            id
            name
            deployments {
              edges {
                node {
                  id
                  status
                  createdAt
                }
              }
            }
          }
        }
      `, { serviceId: body.serviceId });

      const latestDeployment = statusData.service.deployments.edges[0]?.node;

      return new Response(
        JSON.stringify({
          success: true,
          service: statusData.service.name,
          latestDeployment: latestDeployment ? {
            id: latestDeployment.id,
            status: latestDeployment.status,
            createdAt: latestDeployment.createdAt,
          } : null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Unknown action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Railway deploy error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Deployment failed',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
