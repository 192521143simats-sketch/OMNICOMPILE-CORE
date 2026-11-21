// Uses only the supported JDK compiler tree API. Never loads or executes user classes.
export const optimizerJava = String.raw`
import java.nio.file.*;
import java.util.*;
import javax.tools.*;
import com.sun.source.tree.*;
import com.sun.source.util.*;
public class OmniIntFold {
 static Integer value(Tree t) {
  if(t instanceof LiteralTree l) return l.getValue() instanceof Integer i ? i : null;
  if(t instanceof ParenthesizedTree p) return value(p.getExpression());
  if(t instanceof UnaryTree u) { Integer a=value(u.getExpression()); if(a==null)return null;
   return switch(t.getKind()){case UNARY_PLUS -> a; case UNARY_MINUS -> -a; case BITWISE_COMPLEMENT -> ~a; default -> null;}; }
  if(t instanceof BinaryTree b) { Integer x=value(b.getLeftOperand()),y=value(b.getRightOperand());if(x==null||y==null)return null;int a=x,c=y;
   return switch(t.getKind()){case PLUS -> a+c;case MINUS -> a-c;case MULTIPLY -> a*c;case DIVIDE -> c==0?null:Integer.valueOf(a/c);case REMAINDER -> c==0?null:Integer.valueOf(a%c);case LEFT_SHIFT -> a<<c;case RIGHT_SHIFT -> a>>c;case UNSIGNED_RIGHT_SHIFT -> a>>>c;case AND -> a&c;case OR -> a|c;case XOR -> a^c;default -> null;}; }
  return null;
 }
 record Edit(int start,int end,String text){}
 record DeadCodeResult(String source,int transformations,int removedStatements,int originalOperators){}
 static Boolean booleanLiteral(Tree tree){
  if(tree instanceof ParenthesizedTree p)return booleanLiteral(p.getExpression());
  return tree instanceof LiteralTree l && l.getValue() instanceof Boolean b ? b : null;
 }
 static boolean unsafe(Tree tree){
  boolean[] found={false};new TreeScanner<Void,Void>(){
   public Void scan(Tree node,Void p){
    if(node instanceof ClassTree || node instanceof LambdaExpressionTree || node instanceof MemberReferenceTree || node instanceof ReturnTree || node instanceof ThrowTree || node instanceof BreakTree || node instanceof ContinueTree || node instanceof TryTree || node instanceof ForLoopTree || node instanceof EnhancedForLoopTree || node instanceof WhileLoopTree || node instanceof DoWhileLoopTree || node instanceof SwitchTree || node instanceof SwitchExpressionTree || node instanceof LabeledStatementTree)found[0]=true;
    return super.scan(node,p);
   }
  }.scan(tree,null);return found[0];
 }
 // Count executable/declaration statements, excluding block wrappers and empty statements.
 static int statementCount(Tree tree){
  int[] count={0};new TreeScanner<Void,Void>(){public Void scan(Tree node,Void p){if(node instanceof StatementTree && !(node instanceof BlockTree) && !(node instanceof EmptyStatementTree))count[0]++;return super.scan(node,p);}}.scan(tree,null);return count[0];
 }
 static JavaFileObject sourceFile(Path input,String source){
  return new SimpleJavaFileObject(input.toUri(),JavaFileObject.Kind.SOURCE){public CharSequence getCharContent(boolean ignored){return source;}};
 }
 static DeadCodeResult deadCodeElimination(JavaCompiler compiler,StandardJavaFileManager fm,Path input,String source)throws Exception{
  JavacTask task=(JavacTask)compiler.getTask(null,fm,null,List.of("-proc:none","-encoding","UTF-8"),null,List.of(sourceFile(input,source)));
  List<Edit> edits=new ArrayList<>();int[] removed={0},originalOperators={0};
  for(CompilationUnitTree unit:task.parse()){
   new TreeScanner<Void,Void>(){public Void scan(Tree node,Void p){if(node instanceof BinaryTree||node instanceof UnaryTree)originalOperators[0]++;return super.scan(node,p);}}.scan(unit,null);
   SourcePositions positions=Trees.instance(task).getSourcePositions();
   new TreePathScanner<Void,Boolean>(){
    public Void scan(Tree tree,Boolean blocked){
     boolean next=Boolean.TRUE.equals(blocked)||tree instanceof TryTree||tree instanceof ForLoopTree||tree instanceof EnhancedForLoopTree||tree instanceof WhileLoopTree||tree instanceof DoWhileLoopTree||tree instanceof LabeledStatementTree||tree instanceof SwitchTree||tree instanceof SwitchExpressionTree||tree instanceof LambdaExpressionTree;
     return super.scan(tree,next);
    }
    public Void visitIf(IfTree tree,Boolean blocked){
     Boolean condition=booleanLiteral(tree.getCondition());
     // A block parent plus a fresh wrapper preserves the kept statement's scope.
     if(!Boolean.TRUE.equals(blocked)&&condition!=null&&getCurrentPath().getParentPath().getLeaf() instanceof BlockTree&&!unsafe(tree)){
      StatementTree kept=condition?tree.getThenStatement():tree.getElseStatement(),dead=condition?tree.getElseStatement():tree.getThenStatement();
      int count=statementCount(dead);long start=positions.getStartPosition(unit,tree),end=positions.getEndPosition(unit,tree);
      long keptStart=kept==null?0:positions.getStartPosition(unit,kept),keptEnd=kept==null?0:positions.getEndPosition(unit,kept);
      if(count>0&&start>=0&&end>start&&end<=source.length()&&keptStart>=0&&keptEnd>=keptStart&&keptEnd<=source.length()){
       edits.add(new Edit((int)start,(int)end,kept==null?"{}":"{"+source.substring((int)keptStart,(int)keptEnd)+"}"));removed[0]+=count;return null;
      }
     }
     return super.visitIf(tree,blocked);
    }
   }.scan(unit,false);
  }
  edits.sort(Comparator.comparingInt(Edit::start).reversed());StringBuilder result=new StringBuilder(source);for(Edit edit:edits)result.replace(edit.start(),edit.end(),edit.text());
  return new DeadCodeResult(result.toString(),edits.size(),removed[0],originalOperators[0]);
 }
 public static void main(String[] args)throws Exception {
  Path input=Path.of(java.net.URI.create(args[0]));String source=Files.readString(input);JavaCompiler compiler=ToolProvider.getSystemJavaCompiler();
  try(StandardJavaFileManager fm=compiler.getStandardFileManager(null,Locale.ROOT,java.nio.charset.StandardCharsets.UTF_8)) {
   DeadCodeResult dce=deadCodeElimination(compiler,fm,input,source);String optimizedSource=dce.source();
   JavacTask task=(JavacTask)compiler.getTask(null,fm,null,List.of("-proc:none","-encoding","UTF-8"),null,List.of(sourceFile(input,optimizedSource)));
   List<Edit> edits=new ArrayList<>();
   for(CompilationUnitTree unit:task.parse()) {
    SourcePositions positions=Trees.instance(task).getSourcePositions();
    new TreeScanner<Void,Void>() {
     public Void scan(Tree tree,Void unused){
      if(tree==null)return null;
      if(tree instanceof BinaryTree||tree instanceof UnaryTree){
       Integer folded=value(tree);
       if(folded!=null){long start=positions.getStartPosition(unit,tree),end=positions.getEndPosition(unit,tree);
        if(start>=0&&end>start&&end<=optimizedSource.length()){
         edits.add(new Edit((int)start,(int)end,"("+folded+")"));return null;
        }
       }
      }
      return super.scan(tree,unused);
     }
    }.scan(unit,null);
   }
   edits.sort(Comparator.comparingInt(Edit::start).reversed());StringBuilder result=new StringBuilder(optimizedSource);
   for(Edit edit:edits)result.replace(edit.start(),edit.end(),edit.text());
   Files.writeString(Path.of(java.net.URI.create(args[1])),result);
   JavaFileObject finalSource=new SimpleJavaFileObject(java.net.URI.create("string:///Main.java"),JavaFileObject.Kind.SOURCE){public CharSequence getCharContent(boolean ignored){return result;}};
   JavacTask finalTask=(JavacTask)compiler.getTask(null,fm,null,List.of("-proc:none"),null,List.of(finalSource));
   int[] after={0};for(CompilationUnitTree unit:finalTask.parse())new TreeScanner<Void,Void>(){public Void scan(Tree node,Void p){if(node instanceof BinaryTree||node instanceof UnaryTree)after[0]++;return super.scan(node,p);}}.scan(unit,null);
   System.out.print((edits.size()+dce.transformations())+","+dce.originalOperators()+","+after[0]+","+dce.removedStatements());
  }
 }
}
`;
