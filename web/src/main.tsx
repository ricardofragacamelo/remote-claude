import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';

import { registerExplorer } from '@/features/explorer';
import {
  registerClaudeChanges,
  registerClaudeContext,
  registerSessionsView,
} from '@/features/session';
import { Providers } from './app/providers';
import { router } from './app/router';
import '@/styles/globals.css';

// The Explorer takes its place in the workbench before any folder tab is made: a tab is given back
// what it kept the moment it is made (plan 07, B-24).
registerExplorer();
registerSessionsView();
registerClaudeChanges();
registerClaudeContext();

const container = document.querySelector('#root');

if (container === null) {
  throw new Error('the document has no #root to mount into');
}

createRoot(container).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
