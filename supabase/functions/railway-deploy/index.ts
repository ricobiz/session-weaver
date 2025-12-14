import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeployRequest {
  action: 'check' | 'deploy' | 'status' | 'logs' | 'delete-project' | 'delete-service' | 'cleanup' | 'redeploy' | 'project-info';
  serviceId?: string;
  projectId?: string;
  repoUrl?: string;
}

const RAILWAY_API = 'https://backboard.railway.com/graphql/v2';

// Try both token types - Account token uses Authorization, Team token uses Team-Access-Token
async function railwayQuery(token: string, query: string, variables?: Record<string, any>, useTeamHeader = false) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (useTeamHeader) {
    headers['Team-Access-Token'] = token;
  } else {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(RAILWAY_API, {
    method: 'POST',
    headers,
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
        let data: any = null;
        let tokenType = 'account';
        let projects: any[] = [];

        // First try as Account token
        try {
          data = await railwayQuery(RAILWAY_API_TOKEN, `
            query {
              me {
                id
                email
                name
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
            }
          `);
          
          console.log('Account token response:', JSON.stringify(data));
          projects = (data.me?.projects?.edges || []).map((e: any) => ({
            id: e.node.id,
            name: e.node.name,
            services: (e.node.services?.edges || []).map((s: any) => ({
              id: s.node.id,
              name: s.node.name,
            })),
          }));
        } catch (e) {
          console.log('Account token failed, trying Team token');
        }

        // If no projects found with Account token, try as Team token
        if (projects.length === 0) {
          try {
            // Team tokens can't access "me" directly, try to list projects differently
            const teamData = await railwayQuery(RAILWAY_API_TOKEN, `
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
            `, undefined, true);
            
            console.log('Team token response:', JSON.stringify(teamData));
            tokenType = 'team';
            projects = (teamData.projects?.edges || []).map((e: any) => ({
              id: e.node.id,
              name: e.node.name,
              services: (e.node.services?.edges || []).map((s: any) => ({
                id: s.node.id,
                name: s.node.name,
              })),
            }));
          } catch (e) {
            console.log('Team token also failed:', e);
          }
        }

        console.log('Found projects:', projects.length, 'Token type:', tokenType);

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
            tokenType,
            user: data?.me ? { id: data.me.id, email: data.me.email, name: data.me.name } : null,
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
        console.error('Check error:', error);
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

      // Step 0: Get user info and projects
      const meData = await railwayQuery(RAILWAY_API_TOKEN, `
        query {
          me {
            id
            name
            projects {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
        }
      `);

      const userId = meData.me?.id;
      const existingProjects = meData.me?.projects?.edges || [];
      console.log('User ID:', userId, 'Found', existingProjects.length, 'existing projects');

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
          HTTP_API_PORT: '3001',
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
    // PROJECT-INFO - Get project details by ID
    // ========================================
    if (action === 'project-info' && body.projectId) {
      console.log('Getting project info:', body.projectId);
      
      const projectData = await railwayQuery(RAILWAY_API_TOKEN, `
        query($projectId: String!) {
          project(id: $projectId) {
            id
            name
            createdAt
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
                  deployments(first: 3) {
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
            }
          }
        }
      `, { projectId: body.projectId });

      const project = projectData.project;
      const services = (project?.services?.edges || []).map((e: any) => ({
        id: e.node.id,
        name: e.node.name,
        deployments: (e.node.deployments?.edges || []).map((d: any) => d.node),
      }));

      const runnerService = services.find((s: any) => 
        s.name.toLowerCase().includes('runner')
      );

      return new Response(
        JSON.stringify({
          success: true,
          project: {
            id: project?.id,
            name: project?.name,
            createdAt: project?.createdAt,
          },
          environments: (project?.environments?.edges || []).map((e: any) => e.node),
          services,
          runnerService: runnerService || null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // LOGS - Get deployment logs
    // ========================================
    if (action === 'logs' && body.projectId) {
      console.log('Getting deployment logs for project:', body.projectId);
      
      // First get the project's services and deployments
      const projectData = await railwayQuery(RAILWAY_API_TOKEN, `
        query($projectId: String!) {
          project(id: $projectId) {
            id
            name
            services {
              edges {
                node {
                  id
                  name
                  deployments(first: 1) {
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
            }
          }
        }
      `, { projectId: body.projectId });

      const services = (projectData.project?.services?.edges || []).map((e: any) => e.node);
      const runnerService = services.find((s: any) => s.name.toLowerCase().includes('runner'));
      const latestDeployment = runnerService?.deployments?.edges?.[0]?.node;

      let buildLogs: any[] = [];
      if (latestDeployment?.id) {
        try {
          const logsData = await railwayQuery(RAILWAY_API_TOKEN, `
            query($deploymentId: String!) {
              deploymentLogs(deploymentId: $deploymentId, limit: 100) {
                message
                timestamp
                severity
              }
            }
          `, { deploymentId: latestDeployment.id });
          
          buildLogs = logsData.deploymentLogs || [];
        } catch (e) {
          console.log('Could not fetch deployment logs:', e);
          
          // Try build logs instead
          try {
            const buildLogsData = await railwayQuery(RAILWAY_API_TOKEN, `
              query($deploymentId: String!) {
                buildLogs(deploymentId: $deploymentId, limit: 100) {
                  message
                  timestamp
                  severity
                }
              }
            `, { deploymentId: latestDeployment.id });
            
            buildLogs = buildLogsData.buildLogs || [];
          } catch (e2) {
            console.log('Could not fetch build logs:', e2);
          }
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          project: projectData.project?.name,
          service: runnerService?.name,
          deployment: latestDeployment ? {
            id: latestDeployment.id,
            status: latestDeployment.status,
            createdAt: latestDeployment.createdAt,
            url: latestDeployment.staticUrl,
          } : null,
          logs: buildLogs.map((l: any) => ({
            severity: l.severity || 'INFO',
            message: l.message,
            timestamp: l.timestamp,
          })),
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

    // ========================================
    // CLEANUP - Delete duplicate runner projects, keep only the first active one
    // ========================================
    if (action === 'cleanup') {
      console.log('Cleaning up duplicate projects...');
      
      // Get all projects using me query
      const meData = await railwayQuery(RAILWAY_API_TOKEN, `
        query {
          me {
            id
            projects {
              edges {
                node {
                  id
                  name
                  createdAt
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
        }
      `);
      
      const allProjects = (meData.me?.projects?.edges || []).map((e: any) => ({
        id: e.node.id,
        name: e.node.name,
        createdAt: e.node.createdAt,
        services: (e.node.services?.edges || []).map((s: any) => s.node),
      }));
      
      console.log('All projects found:', allProjects.length, allProjects.map((p: any) => p.name));

      // Find all runner-related projects
      const runnerProjects = allProjects.filter((p: any) => 
        p.name.toLowerCase().includes('session-weaver') ||
        p.name.toLowerCase().includes('runner')
      );

      console.log(`Found ${runnerProjects.length} runner projects`);

      if (runnerProjects.length <= 1) {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'No duplicate projects to clean up',
            projects: runnerProjects,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Sort by creation date, keep the newest one (or one with most services)
      runnerProjects.sort((a: any, b: any) => {
        // Prefer projects with services
        if (a.services.length !== b.services.length) {
          return b.services.length - a.services.length;
        }
        // Then by date (newest first)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      const keepProject = runnerProjects[0];
      const deleteProjects = runnerProjects.slice(1);

      console.log(`Keeping project: ${keepProject.name} (${keepProject.id})`);
      console.log(`Deleting ${deleteProjects.length} duplicate projects`);

      const deleted: string[] = [];
      const failed: string[] = [];

      for (const project of deleteProjects) {
        try {
          await railwayQuery(RAILWAY_API_TOKEN, `
            mutation($id: String!) {
              projectDelete(id: $id)
            }
          `, { id: project.id });
          deleted.push(project.name);
          console.log(`Deleted: ${project.name}`);
        } catch (e) {
          failed.push(project.name);
          console.log(`Failed to delete: ${project.name}`, e);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Cleaned up ${deleted.length} duplicate projects`,
          kept: keepProject,
          deleted,
          failed,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // REDEPLOY - Redeploy existing service without creating new project
    // ========================================
    if (action === 'redeploy') {
      const { projectId, serviceId } = body;
      
      if (!projectId || !serviceId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'projectId and serviceId are required for redeploy',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get environment ID
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
          }
        }
      `, { projectId });

      const prodEnv = projectData.project.environments.edges.find(
        (e: any) => e.node.name === 'production'
      );
      const environmentId = prodEnv?.node.id;

      if (!environmentId) {
        throw new Error('Production environment not found');
      }

      // Trigger deployment
      await railwayQuery(RAILWAY_API_TOKEN, `
        mutation($serviceId: String!, $environmentId: String!) {
          serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId)
        }
      `, { serviceId, environmentId });

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Redeployment triggered',
          projectId,
          serviceId,
          environmentId,
          dashboardUrl: `https://railway.app/project/${projectId}`,
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