import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';

import { Providers } from './app/providers';
import { router } from './app/router';
import '@/styles/globals.css';

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
