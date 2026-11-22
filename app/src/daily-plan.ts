export function remainingExercises<T extends {id:string;sets:number}>(plan:T[],dailySets:Record<string,number>){
  return plan.filter(exercise=>(dailySets[exercise.id]||0)<exercise.sets);
}
