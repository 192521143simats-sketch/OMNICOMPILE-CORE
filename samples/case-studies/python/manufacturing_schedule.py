from collections import defaultdict

def earliest_finish(tasks):
    finish={}
    def visit(name,trail):
        if name in finish: return finish[name]
        if name in trail: raise ValueError('cyclic manufacturing dependency')
        duration,needs=tasks[name]
        finish[name]=duration+max((visit(dep,trail|{name}) for dep in needs),default=0)
        return finish[name]
    for task in tasks: visit(task,set())
    return finish

tasks={'cut':(3,[]),'paint':(4,['cut']),'wire':(5,[]),'assemble':(2,['paint','wire'])}
result=earliest_finish(tasks)
print('makespan='+str(max(result.values())))
assert result['assemble']==9
