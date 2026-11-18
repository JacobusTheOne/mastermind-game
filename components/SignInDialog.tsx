"use client";

import { useEffect, useRef } from "react";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";

const formFields = {
  signUp: {
    preferred_username: {
      label: "Player name",
      placeholder: "Shown on the leaderboard",
      isRequired: true,
      order: 1,
    },
    email: { order: 2 },
    password: { order: 3 },
    confirm_password: { order: 4 },
  },
};

export function SignInDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Close automatically once sign-in completes.
  useEffect(() => {
    if (open && authStatus === "authenticated") onClose();
  }, [open, authStatus, onClose]);

  return (
    <dialog ref={ref} className="signin-dialog" onClose={onClose} aria-label="Sign in">
      <button type="button" className="close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      {open && <Authenticator formFields={formFields} signUpAttributes={["preferred_username"]} />}
    </dialog>
  );
}
