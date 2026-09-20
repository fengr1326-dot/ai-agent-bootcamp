import { initialState, Profile } from '../domain/models';
import { LocalRepository } from '../../apps/api/src/repository';
import { Service } from '../../apps/api/src/service';

// Real service responses consumed by XCTest, not separately hand-authored mobile mocks.
export async function mobileFixtures() {
  const repo=new LocalRepository(), service=new Service(repo,undefined,()=> '2026-09-17T06:00:00.000Z');
  const profile:Profile={direction:'feelGood',focus:'吃得均衡',age:28,heightCm:170,weightKg:65,sex:'unspecified',activity:'moderate',timezone:'Asia/Shanghai',allergies:[],excludedFoods:[],risks:[],constraintsConfirmed:true,modelImprovementConsent:false};
  const state=initialState();state.profile=profile;
  const meal=service.makeMeal({title:'午餐',eatenAt:'2026-09-17T04:00:00.000Z',status:'eaten',portion:'normal',items:[{foodId:'rice',grams:150},{foodId:'chicken',grams:100}],confidence:'medium'},'00000000-0000-4000-8000-000000000001');
  state.meals=[meal];
  await repo.transact('fixture',s=>Object.assign(s,state),true);
  const responses:Record<string,unknown>={profile,day:service.day(state,'2026-09-17'),meal,foods:await service.read('fixture','foods',{},{}),trends:await service.read('fixture','trends',{},{}),recognition:{id:'00000000-0000-4000-8000-000000000002',status:'ready',items:meal.items,confidence:'medium',warning:'请确认食物和份量。'}};
  return Object.fromEntries(Object.entries(responses).map(([key,data])=>[key,{data,requestId:'contract-fixture'}]));
}
