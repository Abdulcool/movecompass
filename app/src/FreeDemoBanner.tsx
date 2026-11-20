import React,{useEffect,useState} from 'react';
import { Card,Copy } from './ui';
import {useSession} from './session';
import {reportsEphemeral} from './server-config';
export function FreeDemoBanner(){
  const {base}=useSession(),[ephemeral,setEphemeral]=useState(false);
  useEffect(()=>{let active=true;setEphemeral(false);void fetch(base+'/healthz').then(r=>r.ok?r.json():null).then(config=>{if(active)setEphemeral(reportsEphemeral(config));}).catch(()=>{});return()=>{active=false;};},[base]);
  return ephemeral?<Card><Copy>Free demo server: it sleeps when idle (first load can take ~1 min) and resets its data.</Copy></Card>:null;
}
