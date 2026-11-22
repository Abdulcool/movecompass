import {it,expect} from 'vitest';
import {reportsEphemeral} from '../src/server-config';
it('shows the demo warning only for an explicit server boolean',()=>{
  expect(reportsEphemeral({ephemeral:true})).toBe(true);
  for(const value of [null,undefined,{},false,{ephemeral:false},{ephemeral:'true'},{error:'offline'}])expect(reportsEphemeral(value)).toBe(false);
});
