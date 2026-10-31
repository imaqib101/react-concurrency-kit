import { useState, useCallback } from 'react';

export function useToggle(initialValue: boolean = false): [boolean, (value?: boolean) => void] {
  const [value, setValue] = useState<boolean>(initialValue);
  const toggle = useCallback((nextValue?: boolean) => {
    setValue((current) => (typeof nextValue === 'boolean' ? nextValue : !current));
  }, []);
  return [value, toggle];
}
