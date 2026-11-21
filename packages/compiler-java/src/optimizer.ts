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
 public static void main(String[] args)throws Exception {
  Path input=Path.of(java.net.URI.create(args[0]));String source=Files.readString(input);JavaCompiler compiler=ToolProvider.getSystemJavaCompiler();
  try(StandardJavaFileManager fm=compiler.getStandardFileManager(null,Locale.ROOT,java.nio.charset.StandardCharsets.UTF_8)) {
   JavacTask task=(JavacTask)compiler.getTask(null,fm,null,List.of("-proc:none","-encoding","UTF-8"),null,fm.getJavaFileObjects(input.toFile()));
   List<Edit> edits=new ArrayList<>();int[] counts={0,0};
   for(CompilationUnitTree unit:task.parse()) {
    SourcePositions positions=Trees.instance(task).getSourcePositions();
    new TreeScanner<Void,Void>() {
     public Void scan(Tree tree,Void unused){
      if(tree==null)return null;
      if(tree instanceof BinaryTree||tree instanceof UnaryTree){
       counts[0]++;
       Integer folded=value(tree);
       if(folded!=null){long start=positions.getStartPosition(unit,tree),end=positions.getEndPosition(unit,tree);
        if(start>=0&&end>start&&end<=source.length()){
         int[] removed={0};new TreeScanner<Void,Void>(){public Void scan(Tree node,Void p){if(node instanceof BinaryTree||node instanceof UnaryTree)removed[0]++;return super.scan(node,p);}}.scan(tree,null);
         counts[0]+=removed[0]-1;counts[1]+=removed[0];edits.add(new Edit((int)start,(int)end,"("+folded+")"));return null;
        }
       }
      }
      return super.scan(tree,unused);
     }
    }.scan(unit,null);
   }
   edits.sort(Comparator.comparingInt(Edit::start).reversed());StringBuilder result=new StringBuilder(source);
   for(Edit edit:edits)result.replace(edit.start(),edit.end(),edit.text());
   Files.writeString(Path.of(java.net.URI.create(args[1])),result);
   JavaFileObject finalSource=new SimpleJavaFileObject(java.net.URI.create("string:///Main.java"),JavaFileObject.Kind.SOURCE){public CharSequence getCharContent(boolean ignored){return result;}};
   JavacTask finalTask=(JavacTask)compiler.getTask(null,fm,null,List.of("-proc:none"),null,List.of(finalSource));
   int[] after={0};for(CompilationUnitTree unit:finalTask.parse())new TreeScanner<Void,Void>(){public Void scan(Tree node,Void p){if(node instanceof BinaryTree||node instanceof UnaryTree)after[0]++;return super.scan(node,p);}}.scan(unit,null);
   System.out.print(edits.size()+","+counts[0]+","+after[0]);
  }
 }
}
`;
