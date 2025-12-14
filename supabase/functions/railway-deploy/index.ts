import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeployRequest {
  action: 'check' | 'deploy' | 'status' | 'logs' | 'delete-project' | 'delete-service';
  serviceId?: string;
  projectId?: string;
  repoUrl?: string;
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
    const { action, repoUrl } = body;

    // ========================================
    // CHECK - Verify Railway connection
    // ========================================
    if (action === 'check') {
      try {
        const userData = await railwayQuery(RAILWAY_API_TOKEN, `
          query {
            me {
              id
              email
              name
            }
          }
        `);

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

        const runnerProject = projects.find((p: any) => 
          p.name.toLowerCase().includes('automation') || 
          p.name.toLowerCase().includes('runner') ||
          p.name.toLowerCase().includes('session-weaver')
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
    // DEPLOY - Deploy runner from GitHub repo
    // ========================================
    if (action === 'deploy') {
      if (!repoUrl) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'GitHub repository URL is required. Please connect your GitHub and provide your repository URL.',
            action: 'provide_repo_url',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('Starting Railway deployment from GitHub:', repoUrl);

      // Step 0: Get user info and find workspace/projects
      // First, get me info and projects list
      const meData = await railwayQuery(RAILWAY_API_TOKEN, `
        query {
          me {
            id
            name
          }
          projects {
            edges {
              node {
                id
                name
                team {
                  id
                  name
                }
              }
            }
          }
        }
      `);

      const existingProjects = meData.projects?.edges || [];
      const userId = meData.me?.id;
      console.log('Found', existingProjects.length, 'existing projects, userId:', userId);
      
      // Try to find workspace ID from existing projects' team, or use user ID for personal
      let workspaceId: string | null = null;
      for (const proj of existingProjects) {
        if (proj.node.team?.id) {
          workspaceId = proj.node.team.id;
          console.log('Found workspace from existing project:', proj.node.team.name, workspaceId);
          break;
        }
      }
      
      // For personal accounts, use user ID as workspaceId
      if (!workspaceId && userId) {
        workspaceId = userId;
        console.log('Using user ID as workspace for personal account:', workspaceId);
      }

      // Step 1: Find existing project - DO NOT create new ones
      let projectId: string | null = null;

      // Look for any project with runner-related name
      const automationProject = existingProjects.find(
        (e: any) => e.node.name.toLowerCase().includes('session-weaver') ||
                    e.node.name.toLowerCase().includes('runner') ||
                    e.node.name.toLowerCase().includes('automation')
      );

      if (automationProject) {
        projectId = automationProject.node.id;
        console.log('Using existing project:', automationProject.node.name, projectId);
      } else if (existingProjects.length > 0) {
        // Use the first available project if no runner project found
        projectId = existingProjects[0].node.id;
        console.log('Using first available project:', existingProjects[0].node.name, projectId);
      } else {
        // Only create if absolutely no projects exist
        if (!workspaceId) {
          throw new Error('Cannot determine workspace ID. Please ensure you have a Railway account.');
        }
        
        const createResult = await railwayQuery(RAILWAY_API_TOKEN, `
          mutation($input: ProjectCreateInput!) {
            projectCreate(input: $input) {
              id
              name
            }
          }
        `, {
          input: {
            name: 'session-weaver-runner',
            description: 'Playwright automation runner',
            isPublic: false,
            teamId: workspaceId,
          }
        });

        projectId = createResult.projectCreate.id;
        console.log('Created new project:', projectId);
      }

      // Step 2: Get environment
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

      // Step 3: Create or get service with GitHub repo source
      let serviceId: string;
      const existingService = projectData.project.services.edges.find(
        (e: any) => e.node.name === 'runner'
      );

      if (existingService) {
        serviceId = existingService.node.id;
        console.log('Using existing service:', serviceId);
      } else {
      // Create service from GitHub repo
        // Railway expects format "owner/repo", not full URL
        let repoPath = repoUrl;
        if (repoUrl.includes('github.com/')) {
          repoPath = repoUrl.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
        }
        console.log('Using repo path:', repoPath);
        
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
              repo: repoPath,
            }
          }
        });

        serviceId = serviceResult.serviceCreate.id;
        console.log('Created service from GitHub:', serviceId);
      }

      // Step 4: Configure service to use runner directory
      if (environmentId) {
        // Set root directory - Railway will auto-detect Dockerfile
        await railwayQuery(RAILWAY_API_TOKEN, `
          mutation($serviceId: String!, $environmentId: String!) {
            serviceInstanceUpdate(
              serviceId: $serviceId, 
              environmentId: $environmentId, 
              input: {
                rootDirectory: "runner"
              }
            )
          }
        `, {
          serviceId,
          environmentId
        }).then(() => console.log('Root directory set to runner'))
          .catch(e => console.log('Service instance update note:', e.message));

        // Set environment variables
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
      await railwayQuery(RAILWAY_API_TOKEN, `
        mutation($serviceId: String!, $environmentId: String!) {
          serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId)
        }
      `, { serviceId, environmentId }).catch(e => {
        console.log('Deploy trigger note:', e.message);
        // Railway often auto-deploys on service creation, so this may not be needed
      });

      console.log('Deployment initiated');

      return new Response(
        JSON.stringify({
          success: true,
          projectId,
          serviceId,
          environmentId,
          repoUrl,
          message: 'Runner deployment started from GitHub repository',
          dashboardUrl: `https://railway.app/project/${projectId}`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // STATUS - Check deployment status with logs
    // ========================================
    if (action === 'status' && body.serviceId) {
      const statusData = await railwayQuery(RAILWAY_API_TOKEN, `
        query($serviceId: String!) {
          service(id: $serviceId) {
            id
            name
            deployments(first: 5) {
              edges {
                node {
                  id
                  status
                  createdAt
                  staticUrl
                }
              }
            }
          }
        }
      `, { serviceId: body.serviceId });

      const deployments = statusData.service.deployments.edges.map((e: any) => e.node);
      const latestDeployment = deployments[0];

      // Try to get build logs for the latest deployment
      let buildLogs: string[] = [];
      if (latestDeployment?.id) {
        try {
          const logsData = await railwayQuery(RAILWAY_API_TOKEN, `
            query($deploymentId: String!) {
              deploymentLogs(deploymentId: $deploymentId, limit: 50) {
                message
                timestamp
                severity
              }
            }
          `, { deploymentId: latestDeployment.id });
          
          buildLogs = logsData.deploymentLogs?.map((l: any) => 
            `[${l.severity || 'INFO'}] ${l.message}`
          ) || [];
        } catch (e) {
          // Logs might not be available yet
          console.log('Could not fetch logs:', e);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          service: statusData.service.name,
          deployments: deployments.slice(0, 3),
          latestDeployment: latestDeployment ? {
            id: latestDeployment.id,
            status: latestDeployment.status,
            createdAt: latestDeployment.createdAt,
            url: latestDeployment.staticUrl,
          } : null,
          buildLogs,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // DELETE-PROJECT - Delete entire project
    // ========================================
    if (action === 'delete-project' && body.projectId) {
      console.log('Deleting project:', body.projectId);
      
      await railwayQuery(RAILWAY_API_TOKEN, `
        mutation($id: String!) {
          projectDelete(id: $id)
        }
      `, { id: body.projectId });

      console.log('Project deleted successfully');

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Project deleted successfully',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // DELETE-SERVICE - Delete a service
    // ========================================
    if (action === 'delete-service' && body.serviceId) {
      console.log('Deleting service:', body.serviceId);
      
      await railwayQuery(RAILWAY_API_TOKEN, `
        mutation($id: String!) {
          serviceDelete(id: $id)
        }
      `, { id: body.serviceId });

      console.log('Service deleted successfully');

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Service deleted successfully',
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