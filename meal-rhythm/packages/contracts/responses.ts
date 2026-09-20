import { z } from 'zod';
import { profileSchema,contextSchema,mealInputSchema,rangeSchema,itemSchema,notificationSchema,instant } from '../domain/models';

const nutrition=z.object({energy:rangeSchema,protein:rangeSchema,fiber:rangeSchema,water:rangeSchema});
const meal=mealInputSchema.extend({id:z.string(),revision:z.number().int(),nutrition,createdAt:instant,updatedAt:instant,sourceVersion:z.string()});
const food=z.object({id:z.string(),name:z.string(),aliases:z.array(z.string()),category:z.string(),per100g:z.object({energy:z.number(),protein:z.number(),fiber:z.number(),water:z.number()}),allergens:z.array(z.string()),source:z.string()});
const gap=z.object({key:z.enum(['energy','protein','fiber','water']),remaining:rangeSchema,status:z.enum(['priority','optional','insufficientData','possiblyExcess','sufficient']),label:z.string(),unit:z.string()});
const nutritionState=z.object({consumed:nutrition,targets:nutrition.nullable(),gaps:z.array(gap),highlights:z.array(gap),confidence:z.enum(['low','medium','high']),mealCount:z.number().int(),bedtime:z.boolean(),ruleVersion:z.string()});
const recommendation=z.object({id:z.string(),title:z.string(),items:z.array(itemSchema),scene:z.string(),minutes:z.number(),substitution:z.string(),reasons:z.array(z.string()),score:z.number(),nutrition,ruleVersion:z.string()});
const day=z.object({date:z.string(),context:contextSchema,window:z.object({start:instant.nullable(),end:instant.nullable(),reason:z.string(),mode:z.enum(['rest','meal'])}),nutrition:nutritionState,meals:z.array(meal),recommendations:z.array(recommendation),safety:z.object({blocked:z.boolean(),needsConstraints:z.boolean(),message:z.string().nullable()}),notificationPreferences:notificationSchema,catalogVersion:z.string(),experimental:z.boolean()});
const session=z.object({accessToken:z.string(),refreshToken:z.string(),expiresIn:z.number(),userId:z.string()});
const recognition=z.object({id:z.string(),mealId:z.string().nullable(),uploadId:z.string().nullable(),text:z.string().nullable(),status:z.enum(['queued','processing','ready','failed','confirmed']),items:z.array(itemSchema),confidence:z.enum(['low','medium','high']),warning:z.string(),provider:z.string(),model:z.string(),confirmedMealId:z.string().nullable(),createdAt:instant});
const saved=z.object({saved:z.literal(true)}),deleted=z.object({deleted:z.literal(true)});
export const responseSchemas:Record<string,z.ZodType>={
  health:z.object({status:z.literal('ok'),version:z.string(),storage:z.enum(['local','postgresql']),experimental:z.boolean()}),
  guest:session,apple:session,refresh:session,profile:profileSchema.nullable(),saveProfile:profileSchema,
  foods:z.object({version:z.string(),experimental:z.boolean(),items:z.array(food)}),day,context:day,nutrition:nutritionState,
  meals:z.object({items:z.array(meal),nextCursor:z.string().nullable()}),meal,createMeal:meal,updateMeal:meal,deleteMeal:deleted,
  preMeal:z.object({meal,canRecommend:z.boolean(),judgment:z.string(),keep:z.string(),adjustments:z.array(z.string()),warning:z.string()}),
  recommendations:z.array(recommendation),feedback:saved,
  trends:z.object({days:z.array(z.object({date:z.string(),mealCount:z.number(),consumed:nutrition,confidence:z.string()})),message:z.string()}),
  presign:z.object({uploadId:z.string(),url:z.string().url(),expiresAt:instant}),recognize:recognition,recognition,confirmRecognition:meal,
  notificationPreferences:notificationSchema,device:saved,respondNotification:saved,
  notifications:z.array(z.object({id:z.string(),at:instant,title:z.string(),body:z.string(),status:z.enum(['scheduled','cancelled','sent']),attempts:z.number()})),
  export:z.object({exportedAt:instant,profile:profileSchema.nullable(),contexts:z.record(z.string(),contextSchema),meals:z.array(meal),feedback:z.array(z.object({recommendationId:z.string(),action:z.string(),at:instant})),notificationPreferences:notificationSchema,recognition:z.array(recognition.omit({text:true})),photoCount:z.number()}),
  deleteAccount:deleted
};
export const errorSchema=z.object({code:z.string(),message:z.string(),requestId:z.string(),fields:z.array(z.object({path:z.string(),message:z.string()})).optional()});
