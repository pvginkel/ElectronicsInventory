import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  usePostKits,
  type KitCreateSchema_b98797e,
  type KitResponseSchema_b98797e,
} from '@/lib/api/generated/hooks';

export interface KitCreateInput {
  name: string;
  description: string | null;
  buildTarget: number;
}

export interface UseKitCreateResult {
  createKit: (input: KitCreateInput) => Promise<KitResponseSchema_b98797e>;
  isPending: boolean;
  error: Error | null;
  reset: () => void;
}

/**
 * Wrap the generated mutation so callers can submit sanitized payloads
 * and wait for the overview queries to refresh before proceeding.
 */
export function useKitCreate(): UseKitCreateResult {
  const queryClient = useQueryClient();
  const mutation = usePostKits({
    mutationKey: ['kits.create'],
    onSuccess: () => {},
  });

  const createKit = useCallback(
    async (input: KitCreateInput) => {
      const payload: KitCreateSchema_b98797e = {
        name: input.name,
        description: input.description ?? null,
        build_target: input.buildTarget,
      };
      const response = await mutation.mutateAsync({ body: payload });
      await queryClient.invalidateQueries({ queryKey: ['getKits'] });
      return response;
    },
    [mutation, queryClient],
  );

  const reset = useCallback(() => {
    mutation.reset();
  }, [mutation]);

  return {
    createKit,
    isPending: mutation.isPending,
    error: mutation.error,
    reset,
  };
}
