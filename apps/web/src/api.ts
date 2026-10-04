import { useQuery } from '@tanstack/react-query';

export interface PublicConfig {
  mode: 'demo'; currency: 'USD'; minAmountMinor: number;
  paymentsEnabled: boolean; paymentMethods: string[]; charitySharePercent: number;
}

const staticDemoConfig: PublicConfig = {
  mode: 'demo', currency: 'USD', minAmountMinor: 100,
  paymentsEnabled: false, paymentMethods: [], charitySharePercent: 25,
};

export function usePublicConfig() {
  return useQuery({
    queryKey: ['public-config'],
    queryFn: async ({ signal }): Promise<PublicConfig> => {
      // GitHub Pages hosts the demo without the Go API.
      if (import.meta.env.VITE_DEPLOY_TARGET === 'github-pages') return staticDemoConfig;
      const response = await fetch('/api/config', { signal });
      if (!response.ok) throw new Error('Service configuration unavailable');
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object') throw new Error('Invalid service configuration');
      const config = data as Partial<PublicConfig>;
      if (config.mode !== 'demo' || config.currency !== 'USD' || config.minAmountMinor !== 100 || config.paymentsEnabled !== false || config.charitySharePercent !== 25 || !Array.isArray(config.paymentMethods)) throw new Error('Unsupported service configuration');
      return config as PublicConfig;
    },
    staleTime: 60_000, retry: 1,
  });
}
