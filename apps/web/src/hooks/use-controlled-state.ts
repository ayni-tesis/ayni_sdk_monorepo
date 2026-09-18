import * as React from "react";

interface CommonControlledStateProps<T> {
  value?: T;
  defaultValue?: T;
}

export function useControlledState<T, Rest extends unknown[] = []>(
  props: CommonControlledStateProps<T> & {
    onChange?: (value: T, ...args: Rest) => void;
  },
): readonly [T, (next: T, ...args: Rest) => void] {
  const { value, defaultValue, onChange } = props;

  const isControlled = value !== undefined;
  const [internalState, setInternalState] = React.useState<T>(defaultValue as T);

  const state = isControlled ? value : internalState;

  const setState = React.useCallback(
    (next: T, ...args: Rest) => {
      if (!isControlled) {
        setInternalState(next);
      }
      onChange?.(next, ...args);
    },
    [isControlled, onChange],
  );

  return [state, setState] as const;
}
