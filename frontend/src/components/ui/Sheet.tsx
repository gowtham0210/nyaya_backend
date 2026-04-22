import { PropsWithChildren } from 'react';
import { Modal } from '@/components/ui/Modal';

type SheetProps = PropsWithChildren<{
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
}>;

export function Sheet({ open, title, description, onClose, children }: SheetProps) {
  return (
    <Modal open={open} title={title} description={description} onClose={onClose} widthClassName="max-w-3xl">
      <div className="mt-6 flex max-h-[calc(100vh-10rem)] min-h-0 flex-col">{children}</div>
    </Modal>
  );
}
