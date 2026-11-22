import { ApiError } from './api';
export async function wakeRetry<T>(operation:(timeout:number)=>Promise<T>,waiting:()=>void,now=Date.now,pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))){
  const deadline=now()+90000;let delay=2000;
  while(true){
    try{return await operation(Math.max(1,Math.min(12000,deadline-now())));}
    catch(error){
      if(!(error instanceof ApiError)||![0,502,503,504].includes(error.status))throw error;
      if(now()>=deadline)throw new Error('The server is still waking. Please wait a moment and try again.');
      waiting();await pause(Math.min(delay,deadline-now()));delay=Math.min(delay*2,10000);
      if(now()>=deadline)throw new Error('The server is still waking. Please wait a moment and try again.');
    }
  }
}
