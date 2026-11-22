import {expect,it} from 'vitest';
import {RealtimeTickets} from './realtime-tickets.js';
it('binds single-use tickets to origin and socket role, and expires them',()=>{
  let now=0;const tickets=new RealtimeTickets(()=>now);
  const token=tickets.issue('admin','https://ui.example.com','private-session');
  expect(tickets.consume(token,'worker','https://ui.example.com')).toBeUndefined();
  expect(tickets.consume(token,'admin','https://wrong.example.com')).toBeUndefined();
  expect(tickets.consume(token,'admin','https://ui.example.com')).toBe('private-session');
  expect(tickets.consume(token,'admin','https://ui.example.com')).toBeUndefined();
  const expired=tickets.issue('worker','https://ui.example.com','private-credential');
  now=30001;
  expect(tickets.consume(expired,'worker','https://ui.example.com')).toBeUndefined();
});
