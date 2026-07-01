import React, { useId } from 'react';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const generatedId = useId();
  const labelId = useId();

  let childWithId: React.ReactNode;
  let targetId: string | undefined;

  // Only attempt to clone and inject ID if it's a single element and NOT a Fragment
  if (React.isValidElement(children) && children.type !== React.Fragment) {
    const childElement = children as React.ReactElement<{ id?: string }>;
    targetId = childElement.props.id || generatedId;
    childWithId = React.cloneElement(childElement, { id: targetId });
  } else {
    // If multiple children or a Fragment, use aria-labelledby for accessibility.
    childWithId = (
      <div role="group" aria-labelledby={labelId}>
        {children}
      </div>
    );
  }

  return (
    <div className="grid gap-2.5">
      <label
        id={labelId}
        htmlFor={targetId}
        className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted font-display"
      >
        {label}
      </label>
      {childWithId}
    </div>
  );
}
