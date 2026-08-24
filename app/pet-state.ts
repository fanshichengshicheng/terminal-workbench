export type SharedPetState={
 food:number;
 xp:number;
 satiety:number;
 rewardedPlanIds:string[];
};

export type PetAction="feed"|"interact";

export const PET_STATE_KEY="workbench-pet-state-v1";
export const PET_STATE_EVENT="workbench:pet-state";
export const PET_ACTION_EVENT="workbench:pet-action";

const LEGACY_COMPANION_KEY="workbench-ai-companion-v1";
const defaultPetState:SharedPetState={food:0,xp:0,satiety:64,rewardedPlanIds:[]};
const isObject=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==="object"&&!Array.isArray(value));

function normalizePetState(value:unknown):SharedPetState{
 const pet=isObject(value)?value:{};
 return{
  food:Math.max(0,Math.floor(Number(pet.food)||0)),
  xp:Math.max(0,Math.floor(Number(pet.xp)||0)),
  satiety:Math.max(0,Math.min(100,Number.isFinite(Number(pet.satiety))?Math.floor(Number(pet.satiety)):defaultPetState.satiety)),
  rewardedPlanIds:Array.isArray(pet.rewardedPlanIds)?[...new Set(pet.rewardedPlanIds.filter((id):id is string=>typeof id==="string"))]:[]
 };
}

function parseStoredPet(value:string|null){
 if(!value)return null;
 try{return normalizePetState(JSON.parse(value))}catch{return null}
}

export function loadSharedPetState():SharedPetState{
 if(typeof window==="undefined")return{...defaultPetState,rewardedPlanIds:[]};
 const stored=parseStoredPet(window.localStorage.getItem(PET_STATE_KEY));
 if(stored)return stored;
 try{
  const legacy:unknown=JSON.parse(window.localStorage.getItem(LEGACY_COMPANION_KEY)||"null");
  const migrated=normalizePetState(isObject(legacy)?legacy.pet:null);
  window.localStorage.setItem(PET_STATE_KEY,JSON.stringify(migrated));
  return migrated;
 }catch{return{...defaultPetState,rewardedPlanIds:[]}}
}

export function saveSharedPetState(value:SharedPetState){
 const next=normalizePetState(value);
 if(typeof window!=="undefined"){
  window.localStorage.setItem(PET_STATE_KEY,JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<SharedPetState>(PET_STATE_EVENT,{detail:next}));
 }
 return next;
}

export function updateSharedPetState(update:(current:SharedPetState)=>SharedPetState){
 return saveSharedPetState(update(loadSharedPetState()));
}

export function dispatchPetAction(action:PetAction){
 if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent<PetAction>(PET_ACTION_EVENT,{detail:action}));
}
