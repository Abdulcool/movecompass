import React,{useEffect,useState} from 'react';
import { Text } from 'react-native';
import { Redirect,router } from 'expo-router';
import { api,type Event } from '../src/api';
import { useSession } from '../src/session';
import { Button,Card,Copy,Page,Title,s } from '../src/ui';
export default function History(){
  const session=useSession(),[events,setEvents]=useState<Event[]>([]),[total,setTotal]=useState(0),[before,setBefore]=useState<number|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function load(cursor?:number){
    setBusy(true);setError('');
    try{
      const data=await api<{events:Event[];total:number;nextBefore:number|null}>(session.base,`/api/events?limit=50${cursor?`&before=${cursor}`:''}`,session.token);
      setEvents(current=>cursor?Array.from(new Map([...current,...data.events].map(e=>[e.id,e])).values()):data.events);
      setTotal(data.total);setBefore(data.nextBefore);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  useEffect(()=>{if(session.user)void load();},[session.token,session.user?.id]);
  if(!session.ready)return <Page><Copy>Opening your history…</Copy></Page>;
  if(!session.user)return <Redirect href="/"/>;
  return <Page><Title>Your activity history</Title><Copy>Showing {events.length} of {total} recorded activities</Copy>{events.map(e=><Card key={e.id}><Text style={s.heading}>{e.exerciseName}</Text><Copy>{e.reps} reps · {e.source} · {new Date(e.completedAt).toLocaleString()}</Copy></Card>)}{!events.length&&!busy&&<Copy>No completed activities yet.</Copy>}{!!error&&<Copy>{error}</Copy>}{before!==null&&<Button title={busy?'Loading…':'Load more activity'} disabled={busy} onPress={()=>void load(before)}/>}<Button title="Refresh history" disabled={busy} secondary onPress={()=>void load()}/><Button title="Back to Profile" secondary onPress={()=>router.replace('/(tabs)/profile')}/></Page>;
}
