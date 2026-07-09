import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { UtilityWindow } from './index';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UtilityWindow />
  </StrictMode>,
);
