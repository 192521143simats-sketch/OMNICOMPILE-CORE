from collections import defaultdict, deque

def alerts(events,window,threshold):
    active=defaultdict(deque)
    hits=[]
    for timestamp,account,amount in events:
        queue=active[account]
        while queue and timestamp-queue[0][0]>window:
            queue.popleft()
        queue.append((timestamp,amount))
        if sum(value for _,value in queue)>=threshold:
            hits.append((timestamp,account))
    return hits

events=[(0,'A',40),(2,'B',90),(3,'A',70),(20,'A',5)]
result=alerts(events,10,100)
print('alerts='+str(len(result))+' account='+result[0][1])
assert result==[(3,'A')]
