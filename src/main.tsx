import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PetWindow } from './pet-window';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PetWindow />
  </StrictMode>,
);
