import { useMutation } from '@tanstack/react-query'
import { venice } from '../lib/venice-client'
import type { ImageGenerateRequest, ImageGenerateResponse } from '../types/venice'
import { useBackgroundTaskStore } from '../stores/background-task-store'

export function useImageGenerate() {
  return useMutation({
    mutationFn: async (req: ImageGenerateRequest) => {
      const taskId = `image-${Date.now()}`
      // Note: Image does not use a queue_id, so we pass empty string or unique id
      useBackgroundTaskStore.getState().registerQueueTask(taskId, 'image', 'sync-request', { request: req })
      
      try {
        const response = await venice<ImageGenerateResponse>('/image/generate', {
          method: 'POST',
          body: req,
        })
        useBackgroundTaskStore.getState().updateTask(taskId, { status: 'completed' })
        return response
      } catch (err) {
        useBackgroundTaskStore.getState().updateTask(taskId, { status: 'failed', error: String(err) })
        throw err
      }
    },
  })
}
