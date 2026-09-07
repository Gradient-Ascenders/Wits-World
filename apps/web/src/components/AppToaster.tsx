import { CheckCircleIcon, XIcon } from '@phosphor-icons/react';
import { Toaster, toast } from 'sonner';

/** One routine confirmation at a time; decisions and failures stay inline. */
export function confirmAction(message: string) {
  toast.success(message, { id: 'action-confirmation' });
}

export function AppToaster() {
  return (
    <Toaster
      className="app-toaster"
      theme="dark"
      position="bottom-right"
      visibleToasts={1}
      closeButton
      duration={5000}
      offset="24px"
      mobileOffset={{
        bottom: 'calc(5.5rem + env(safe-area-inset-bottom))',
        left: '16px',
        right: '16px',
      }}
      icons={{
        success: <CheckCircleIcon aria-hidden="true" size={20} />,
        close: <XIcon aria-hidden="true" size={16} />,
      }}
      toastOptions={{
        classNames: { toast: 'app-toast', closeButton: 'app-toast__close' },
        closeButtonAriaLabel: 'Dismiss confirmation',
      }}
    />
  );
}
