/**
 * Proxy Manager for Runner
 * Handles proxy selection, rotation, and binding with profiles
 */

import { log } from '../logger';

export interface ProxyConfig {
  id: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol: 'http' | 'https' | 'socks4' | 'socks5';
  country?: string;
}

export interface ProxyBinding {
  profileId: string;
  proxyId: string;
  proxy: ProxyConfig;
  isSticky: boolean;
  boundAt: Date;
}

/**
 * Proxy Manager class for handling proxy assignments
 */
export class ProxyManager {
  private bindings: Map<string, ProxyBinding> = new Map();
  private proxies: Map<string, ProxyConfig> = new Map();
  private usageCount: Map<string, number> = new Map();

  /**
   * Load proxies from API
   */
  async loadProxies(apiBaseUrl: string): Promise<void> {
    try {
      const response = await fetch(`${apiBaseUrl}/proxies?status=active`);
      if (!response.ok) {
        log('warning', 'Failed to load proxies from API');
        return;
      }

      const data = await response.json();
      const proxies = data.data || [];

      for (const proxy of proxies) {
        this.proxies.set(proxy.id, {
          id: proxy.id,
          host: proxy.host,
          port: proxy.port,
          username: proxy.username,
          password: proxy.password,
          protocol: proxy.proxy_type as any,
          country: proxy.country,
        });
      }

      log('info', `Loaded ${this.proxies.size} active proxies`);
    } catch (error) {
      log('warning', `Failed to load proxies: ${error}`);
    }
  }

  /**
   * Load existing bindings from API
   */
  async loadBindings(apiBaseUrl: string): Promise<void> {
    try {
      const response = await fetch(`${apiBaseUrl}/profile-proxy-bindings`);
      if (!response.ok) return;

      const data = await response.json();
      const bindings = data.data || [];

      for (const binding of bindings) {
        const proxy = this.proxies.get(binding.proxy_id);
        if (proxy) {
          this.bindings.set(binding.profile_id, {
            profileId: binding.profile_id,
            proxyId: binding.proxy_id,
            proxy,
            isSticky: binding.is_sticky,
            boundAt: new Date(binding.bound_at),
          });
        }
      }

      log('info', `Loaded ${this.bindings.size} proxy bindings`);
    } catch (error) {
      log('warning', `Failed to load bindings: ${error}`);
    }
  }

  /**
   * Get proxy for a profile
   * Returns existing binding or auto-selects new proxy
   */
  getProxyForProfile(
    profileId: string,
    preferredCountry?: string
  ): ProxyConfig | null {
    // Check existing binding
    const existingBinding = this.bindings.get(profileId);
    if (existingBinding && existingBinding.isSticky) {
      log('debug', `Using sticky proxy ${existingBinding.proxyId} for profile ${profileId}`);
      return existingBinding.proxy;
    }

    // Auto-select best proxy
    const proxy = this.selectBestProxy(preferredCountry);
    if (!proxy) {
      log('warning', `No available proxy for profile ${profileId}`);
      return null;
    }

    // Create new binding
    this.bindings.set(profileId, {
      profileId,
      proxyId: proxy.id,
      proxy,
      isSticky: true,
      boundAt: new Date(),
    });

    // Track usage
    this.usageCount.set(proxy.id, (this.usageCount.get(proxy.id) || 0) + 1);

    log('info', `Assigned proxy ${proxy.id} to profile ${profileId}`);
    return proxy;
  }

  /**
   * Select best available proxy based on criteria
   */
  private selectBestProxy(preferredCountry?: string): ProxyConfig | null {
    const availableProxies = Array.from(this.proxies.values());
    
    if (availableProxies.length === 0) {
      return null;
    }

    // Filter by country if specified
    let candidates = preferredCountry
      ? availableProxies.filter(p => p.country === preferredCountry)
      : availableProxies;

    // Fall back to all if no country match
    if (candidates.length === 0) {
      candidates = availableProxies;
    }

    // Sort by usage (least used first)
    candidates.sort((a, b) => {
      const usageA = this.usageCount.get(a.id) || 0;
      const usageB = this.usageCount.get(b.id) || 0;
      return usageA - usageB;
    });

    return candidates[0];
  }

  /**
   * Release proxy binding for a profile
   */
  releaseBinding(profileId: string): void {
    const binding = this.bindings.get(profileId);
    if (binding) {
      this.bindings.delete(profileId);
      log('debug', `Released proxy binding for profile ${profileId}`);
    }
  }

  /**
   * Mark proxy as failed and potentially remove it
   */
  markProxyFailed(proxyId: string): void {
    const proxy = this.proxies.get(proxyId);
    if (proxy) {
      // Remove from available proxies
      this.proxies.delete(proxyId);
      
      // Clear any bindings using this proxy
      for (const [profileId, binding] of this.bindings.entries()) {
        if (binding.proxyId === proxyId) {
          this.bindings.delete(profileId);
        }
      }
      
      log('warning', `Marked proxy ${proxyId} as failed and removed from pool`);
    }
  }

  /**
   * Get Playwright proxy config format
   */
  getPlaywrightProxyConfig(proxy: ProxyConfig): {
    server: string;
    username?: string;
    password?: string;
  } {
    const server = `${proxy.protocol}://${proxy.host}:${proxy.port}`;
    
    return {
      server,
      username: proxy.username,
      password: proxy.password,
    };
  }

  /**
   * Get stats about proxy usage
   */
  getStats(): {
    totalProxies: number;
    activeBindings: number;
    usageDistribution: Record<string, number>;
  } {
    return {
      totalProxies: this.proxies.size,
      activeBindings: this.bindings.size,
      usageDistribution: Object.fromEntries(this.usageCount),
    };
  }
}

// Singleton instance
export const proxyManager = new ProxyManager();
