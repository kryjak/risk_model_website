import { useCallback, useEffect, useState } from 'react';
import type { ViewMode } from '../types';

interface UrlParams {
  model: string | null;
  view: ViewMode;
}

export function useUrlParams() {
  const [params, setParams] = useState<UrlParams>(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return {
      model: searchParams.get('model'),
      view: (searchParams.get('view') as ViewMode) || 'byModel',
    };
  });

  // Update URL when params change
  const updateParams = useCallback((newParams: Partial<UrlParams>) => {
    setParams(prev => {
      const updated = { ...prev, ...newParams };
      
      const searchParams = new URLSearchParams();
      if (updated.model) {
        searchParams.set('model', updated.model);
      }
      if (updated.view && updated.view !== 'byModel') {
        searchParams.set('view', updated.view);
      }
      
      const newUrl = searchParams.toString() 
        ? `${window.location.pathname}?${searchParams.toString()}`
        : window.location.pathname;
      
      window.history.pushState({}, '', newUrl);
      
      return updated;
    });
  }, []);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const searchParams = new URLSearchParams(window.location.search);
      setParams({
        model: searchParams.get('model'),
        view: (searchParams.get('view') as ViewMode) || 'byModel',
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return { params, updateParams };
}
