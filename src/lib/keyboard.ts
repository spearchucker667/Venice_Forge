type CompositionAwareKeyboardEvent = {
  isComposing?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
  };
};

/** True while an IME is using Enter or another key to confirm a candidate. */
export function isImeCompositionEvent(event: CompositionAwareKeyboardEvent): boolean {
  return event.isComposing === true || event.nativeEvent?.isComposing === true;
}
