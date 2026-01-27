import { useState, useEffect } from 'react';
import type { RiskModelsIndex, LoadingState } from '../types';

interface UseRiskModelsIndexResult extends LoadingState {
  index: RiskModelsIndex | null;
  refetch: () => void;
}

export function useRiskModelsIndex(): UseRiskModelsIndexResult {
  const [index, setIndex] = useState<RiskModelsIndex | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIndex = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/data/risk_models_index.json');
      if (!response.ok) {
        throw new Error(`Failed to load risk models index: ${response.status}`);
      }
      const data: RiskModelsIndex = await response.json();
      setIndex(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load risk models');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIndex();
  }, []);

  return {
    index,
    isLoading,
    error,
    refetch: fetchIndex,
  };
}
