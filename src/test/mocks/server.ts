import { setupServer } from 'msw/node';
import { firebaseHandlers } from './firebase';

export const server = setupServer(...firebaseHandlers);
