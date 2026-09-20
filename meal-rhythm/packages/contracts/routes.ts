import { z } from 'zod';
import { profileSchema, contextSchema, mealInputSchema, notificationSchema, instant } from '../domain/models';
import { responseSchemas, errorSchema } from './responses';

export const routes = [
  { method: 'GET', path: '/v1/health', operation: 'health', public: true },
  { method: 'GET', path: '/v1/openapi.json', operation: 'openapi', public: true },
  { method: 'POST', path: '/v1/auth/guest', operation: 'guest', public: true, body: z.object({}).strict() },
  { method: 'POST', path: '/v1/auth/apple', operation: 'apple', public: true, body: z.object({ identityToken: z.string().min(10).max(10000), nonce: z.string().min(16).max(256) }).strict() },
  { method: 'POST', path: '/v1/auth/refresh', operation: 'refresh', public: true, body: z.object({ refreshToken: z.string().min(20).max(512) }).strict() },
  { method: 'GET', path: '/v1/profile', operation: 'profile' },
  { method: 'PATCH', path: '/v1/profile', operation: 'saveProfile', body: profileSchema },
  { method: 'GET', path: '/v1/foods', operation: 'foods' },
  { method: 'GET', path: '/v1/days/{date}', operation: 'day' },
  { method: 'PUT', path: '/v1/days/{date}/context', operation: 'context', body: contextSchema },
  { method: 'GET', path: '/v1/days/{date}/nutrition-state', operation: 'nutrition' },
  { method: 'GET', path: '/v1/meals', operation: 'meals' },
  { method: 'POST', path: '/v1/meals', operation: 'createMeal', body: mealInputSchema },
  { method: 'GET', path: '/v1/meals/{id}', operation: 'meal' },
  { method: 'PATCH', path: '/v1/meals/{id}', operation: 'updateMeal', body: mealInputSchema.extend({ revision: z.number().int().positive() }) },
  { method: 'DELETE', path: '/v1/meals/{id}', operation: 'deleteMeal' },
  { method: 'POST', path: '/v1/pre-meal', operation: 'preMeal', body: mealInputSchema },
  { method: 'GET', path: '/v1/recommendations/next', operation: 'recommendations' },
  { method: 'POST', path: '/v1/recommendations/{id}/feedback', operation: 'feedback', body: z.object({ action: z.enum(['adopt', 'skip', 'dislike']) }).strict() },
  { method: 'GET', path: '/v1/trends', operation: 'trends' },
  { method: 'POST', path: '/v1/uploads/presign', operation: 'presign', body: z.object({ mime: z.enum(['image/jpeg', 'image/png']), bytes: z.number().int().min(1).max(8 * 1024 * 1024) }).strict() },
  { method: 'POST', path: '/v1/recognition-jobs', operation: 'recognize', body: z.object({ uploadId: z.string().uuid().optional(), text: z.string().min(1).max(1000).optional(), mealId: z.string().uuid().optional(), consent: z.literal(true) }).strict().refine(x=>!!x.uploadId !== !!x.text, '只能选择照片或文字一种输入') },
  { method: 'GET', path: '/v1/recognition-jobs/{id}', operation: 'recognition' },
  { method: 'POST', path: '/v1/recognition-jobs/{id}/confirm', operation: 'confirmRecognition', body: mealInputSchema },
  { method: 'PATCH', path: '/v1/notification-preferences', operation: 'notificationPreferences', body: notificationSchema },
  { method: 'PUT', path: '/v1/devices/{id}/push-token', operation: 'device', body: z.object({ token: z.string().regex(/^[a-fA-F0-9]{64,200}$/) }).strict() },
  { method: 'GET', path: '/v1/notifications', operation: 'notifications' },
  { method: 'POST', path: '/v1/notifications/{id}/respond', operation: 'respondNotification', body: z.object({ action: z.enum(['ignored', 'snooze', 'opened']), until: instant.optional() }).strict() },
  { method: 'POST', path: '/v1/data-exports', operation: 'export', body: z.object({}).strict() },
  { method: 'DELETE', path: '/v1/account', operation: 'deleteAccount' }
] as const;

export function openapiDocument() {
  const paths: Record<string, any> = {};
  for (const route of routes) {
    const publicRoute = 'public' in route && route.public;
    const parameters: any[] = [...route.path.matchAll(/\{(\w+)\}/g)].map(m => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
    if (!publicRoute && route.method !== 'GET') parameters.push({ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 128 } });
    (paths[route.path] ??= {})[route.method.toLowerCase()] = {
      operationId: route.operation, security: publicRoute ? [] : [{ bearerAuth: [] }], parameters,
      ...('body' in route ? { requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(route.body, { unrepresentable: 'any' }) } } } } : {}),
      responses: {
        '200': { description: 'Success', content: { 'application/json': { schema: route.operation==='openapi' ? {type:'object'} : {type:'object',required:['data','requestId'],properties:{data:z.toJSONSchema(responseSchemas[route.operation],{unrepresentable:'any'}),requestId:{type:'string'}}} } } },
        ...Object.fromEntries([400,401,404,409,422,429,500,503].map(code=>[code,{description:'Structured error',content:{'application/json':{schema:z.toJSONSchema(errorSchema)}}}]))
      }
    };
  }
  return { openapi: '3.1.0', info: { title: 'Meal Rhythm API', version: '0.1.0', description: 'Prototype API. Experimental rules and demo nutrition catalog are not approved for public health guidance.' }, servers: [{ url: 'http://localhost:3000' }], paths,
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }, schemas: { Envelope: { type: 'object', required: ['data', 'requestId'], properties: { data: {}, requestId: { type: 'string' } } } } } };
}
