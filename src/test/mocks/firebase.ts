import { http, HttpResponse } from 'msw';

export const firebaseHandlers = [
  // Firestore document read
  http.get(
    'https://firestore.googleapis.com/v1/projects/*/databases/*/documents/*',
    ({ params }) => {
      const splat = params['2'];
      const docPath = Array.isArray(splat) ? splat.join('/') : splat;
      return HttpResponse.json({
        name: `projects/test-project/databases/(default)/documents/${docPath ?? 'unknown'}`,
        fields: {
          displayName: { stringValue: 'Mock User' },
          role: { stringValue: 'elderly' },
        },
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString(),
      });
    },
  ),

  // Firestore document write
  http.post(
    'https://firestore.googleapis.com/v1/projects/*/databases/*/documents/*',
    () => {
      return HttpResponse.json({
        name: `projects/test-project/databases/(default)/documents/users/${crypto.randomUUID()}`,
        fields: {},
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString(),
      });
    },
  ),
];
