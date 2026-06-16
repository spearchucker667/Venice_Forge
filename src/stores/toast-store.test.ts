/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useToastStore, toast, Toast } from './toast-store'

describe('toast-store', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllTimers()
  })

  describe('useToastStore', () => {
    it('initializes with empty toasts', () => {
      expect(useToastStore.getState().toasts).toEqual([])
    })

    it('push adds a toast and returns its id', () => {
      const id = useToastStore.getState().push({ variant: 'info', title: 'Test' })
      const { toasts } = useToastStore.getState()
      expect(typeof id).toBe('number')
      expect(toasts).toHaveLength(1)
      expect(toasts[0]).toMatchObject({
        id,
        variant: 'info',
        title: 'Test',
        duration: 4500, // default
      })
    })

    it('push with custom duration', () => {
      const id = useToastStore.getState().push({ variant: 'success', title: 'Custom', duration: 1000 })
      expect(useToastStore.getState().toasts[0].duration).toBe(1000)
    })

    it('auto-dismisses toast after duration', () => {
      const id = useToastStore.getState().push({ variant: 'info', title: 'Auto', duration: 1000 })
      expect(useToastStore.getState().toasts).toHaveLength(1)
      
      vi.advanceTimersByTime(999)
      expect(useToastStore.getState().toasts).toHaveLength(1)
      
      vi.advanceTimersByTime(1)
      expect(useToastStore.getState().toasts).toHaveLength(0)
    })

    it('does not auto-dismiss if duration is 0 or less', () => {
      const id = useToastStore.getState().push({ variant: 'warn', title: 'Forever', duration: 0 })
      expect(useToastStore.getState().toasts).toHaveLength(1)
      
      vi.advanceTimersByTime(100000)
      expect(useToastStore.getState().toasts).toHaveLength(1)
      
      useToastStore.getState().dismiss(id)
    })

    it('dismiss removes a specific toast', () => {
      const id1 = useToastStore.getState().push({ variant: 'info', title: 'T1' })
      const id2 = useToastStore.getState().push({ variant: 'info', title: 'T2' })
      
      expect(useToastStore.getState().toasts).toHaveLength(2)
      
      useToastStore.getState().dismiss(id1)
      const { toasts } = useToastStore.getState()
      expect(toasts).toHaveLength(1)
      expect(toasts[0].id).toBe(id2)
    })
  })

  describe('toast helpers', () => {
    it('toast.info pushes info variant', () => {
      toast.info('Info Title', 'Info Desc')
      const { toasts } = useToastStore.getState()
      expect(toasts).toHaveLength(1)
      expect(toasts[0]).toMatchObject({
        variant: 'info',
        title: 'Info Title',
        description: 'Info Desc',
        duration: 4500,
      })
    })

    it('toast.success pushes success variant', () => {
      toast.success('Success Title', 'Success Desc')
      const { toasts } = useToastStore.getState()
      expect(toasts).toHaveLength(1)
      expect(toasts[0]).toMatchObject({
        variant: 'success',
        title: 'Success Title',
        description: 'Success Desc',
        duration: 4500,
      })
    })

    it('toast.warn pushes warn variant with 5500 duration', () => {
      toast.warn('Warn Title', 'Warn Desc')
      const { toasts } = useToastStore.getState()
      expect(toasts).toHaveLength(1)
      expect(toasts[0]).toMatchObject({
        variant: 'warn',
        title: 'Warn Title',
        description: 'Warn Desc',
        duration: 5500,
      })
    })

    it('toast.error pushes error variant with 6500 duration', () => {
      const action = { label: 'Retry', onClick: () => {} }
      toast.error('Error Title', 'Error Desc', action)
      const { toasts } = useToastStore.getState()
      expect(toasts).toHaveLength(1)
      expect(toasts[0]).toMatchObject({
        variant: 'error',
        title: 'Error Title',
        description: 'Error Desc',
        action,
        duration: 6500,
      })
    })

    it('toast.fromError handles Error objects and redacts secrets', () => {
      const err = new Error('Failed with api key vn-1234567890abcdef')
      toast.fromError(err)
      const { toasts } = useToastStore.getState()
      expect(toasts).toHaveLength(1)
      expect(toasts[0]).toMatchObject({
        variant: 'error',
        title: 'Something went wrong',
        description: 'Failed with api key [REDACTED]',
        duration: 6500,
      })
    })

    it('toast.fromError handles strings with custom title', () => {
      toast.fromError('A plain string error sk-abcdef1234567890', 'Custom Title')
      const { toasts } = useToastStore.getState()
      expect(toasts).toHaveLength(1)
      expect(toasts[0]).toMatchObject({
        variant: 'error',
        title: 'Custom Title',
        description: 'A plain string error [REDACTED]',
        duration: 6500,
      })
    })
    
    it('toast.fromError handles unknown values', () => {
      toast.fromError(null)
      const { toasts } = useToastStore.getState()
      expect(toasts).toHaveLength(1)
      expect(toasts[0]).toMatchObject({
        variant: 'error',
        title: 'Something went wrong',
        description: 'Unknown error',
        duration: 6500,
      })
    })
  })
})
