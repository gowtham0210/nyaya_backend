import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'default' | 'danger';
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | undefined>(undefined);

const initialState = {
  open: false,
  title: '',
  description: '',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  tone: 'default',
};

export function ConfirmProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState(initialState);
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);

  const contextValue = useMemo(
    () => ({
      confirm: (options: ConfirmOptions) =>
        new Promise<boolean>((resolve) => {
          setResolver(() => resolve);
          setState({
            open: true,
            title: options.title,
            description: options.description || '',
            confirmText: options.confirmText || 'Confirm',
            cancelText: options.cancelText || 'Cancel',
            tone: options.tone || 'default',
          });
        }),
    }),
    []
  );

  function closeWith(result: boolean) {
    resolver?.(result);
    setResolver(null);
    setState(initialState);
  }

  return (
    <ConfirmContext.Provider value={contextValue}>
      {children}
      <Modal
        open={state.open}
        title={state.title}
        description={state.description}
        onClose={() => closeWith(false)}
        widthClassName="max-w-md"
      >
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => closeWith(false)}>
            {state.cancelText}
          </Button>
          <Button variant={state.tone === 'danger' ? 'danger' : 'primary'} onClick={() => closeWith(true)}>
            {state.confirmText}
          </Button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);

  if (!context) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }

  return context.confirm;
}
