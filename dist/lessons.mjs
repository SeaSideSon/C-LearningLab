// Every frame is an immutable snapshot taken after the highlighted C operation.
export const address = n => '0x' + n.toString(16).toUpperCase();
export const valueOf = cell => cell?.value === undefined ? 'uninitialized' : String(cell.value)+(cell.invalid?' (expired)':'');
export function changes(before, after) {
  const ids = new Set([...Object.keys(before.cells), ...Object.keys(after.cells)]);
  return [...ids].flatMap(id => {
    const a=before.cells[id], b=after.cells[id];
    if (!a || !b || a.value!==b.value || a.target!==b.target)
      return [{id, name:(b||a).name, before:a?valueOf(a):'not created', after:b?valueOf(b):'out of scope', kind:!a?'created':!b?'removed':'written'}];
    return [];
  });
}
class Trace {
  constructor(meta, code) {
    Object.assign(this,meta); this.code=code.trim().split('\n');
    this.state={cells:{},output:'',scope:'main'};
    this.steps=[{...structuredClone(this.state),line:0,title:'Ready to run',what:'Execution starts in main(). Press Next step to execute the first highlighted operation.',observe:'Read the code, then follow each operation. Memory and output will update together.',flow:'No operation has executed yet.',reads:[],focus:[]}];
  }
  cell(id,name,type,location,value,scope='main',extra={}) {
    this.state.cells[id]={id,name,type,address:address(location),value,scope,...extra};
  }
  pointer(id,name,type,location,target,scope='main') {
    this.cell(id,name,type,location,this.state.cells[target].address,scope,{target});
  }
  set(id,value){this.state.cells[id].value=value;}
  leave(){for(const [id,c] of Object.entries(this.state.cells)) if(c.scope!=='main') delete this.state.cells[id]; this.state.scope='main';}
  step(at,title,what,observe,flow,mutate=()=>{},reads=[],focus=[]) {
    const line = this.code.findIndex(l=>l.trim()===at.trim())+1;
    if (!line) throw Error(`Missing source line in ${this.id}: ${at}`);
    mutate(); this.steps.push({...structuredClone(this.state),line,title,what,observe,flow,reads,focus});return this;
  }
  array(values){values.forEach((v,i)=>this.cell('t'+i,`tab[${i}]`,'int',0x1000+i*4,v,'main',{group:'array',index:i}));}
  finish(at,output,explanation) {
    this.step(at,'Print the result',explanation,'The terminal gains output. Reading a value or an address for output does not change the stored values.',`Read memory → output function → terminal`,()=>this.state.output+=output, Object.keys(this.state.cells).filter(id=>!this.state.cells[id].target));
    this.step('return (0);','Program complete','main returns 0. The example has finished successfully.','The final memory view stays visible for review; real automatic objects stop existing when main returns.','No values change in this retained final snapshot.');
    return {id:this.id,title:this.title,tag:this.tag,summary:this.summary,goal:this.goal,code:this.code,steps:this.steps};
  }
}
const meta=(id,title,tag,summary,goal)=>({id,title,tag,summary,goal});
export function buildLessons() {
  const lessons=[];
  let b=new Trace(meta('basic','Address & dereference','Foundations','An address tells you where. A dereference gets you what is there.','Distinguish a, &a, p, &p, and *p.'),`
#include <stdio.h>

int main(void)
{
    int a = 7;
    int *p;

    p = &a;
    printf("a = %d\\n", a);
    printf("*p = %d\\n", *p);
    printf("&a = %p\\n", (void *)&a);
    printf("p = %p\\n", (void *)p);
    printf("&p = %p\\n", (void *)&p);
    return (0);
}`);
  b.step('int a = 7;','Create an integer','Reserve one int object named a and put 7 inside it.','The address labels where a lives. The stored value is 7.','7 → a',()=>b.cell('a','a','int',0x1000,7));
  b.step('int *p;','Create a pointer','Create p, a pointer to int. Its value is not initialized yet.','The star in this declaration describes the type. There is no valid target to follow yet.','p has its own memory slot; no address has been assigned.',()=>b.cell('p','p','int *',0x2000,undefined));
  b.step('p = &a;','Copy an address','&a produces the address of a. Assignment copies that address into p.','p stores 0x1000, not 7. The pointer itself lives at 0x2000.','&a (0x1000) → p',()=>b.pointer('p','p','int *',0x2000,'a'),['a'],['p','a']);
  b.step('printf("a = %d\\n", a);','Read the value directly','Read a and print its integer value.','Memory stays the same. The terminal gains one line.','a → value 7 → terminal',()=>b.state.output+='a = 7\n',['a']);
  b.step('printf("*p = %d\\n", *p);','Follow the address','Read the address inside p, go to a, and read its integer.','a and *p access the same object. No second integer is created.','p → 0x1000 → a → value 7 → terminal',()=>b.state.output+='*p = 7\n',['p','a'],['p','a']);
  b.step('printf("&a = %p\\n", (void *)&a);','Print the object address','&a is an address, printed with %p. The cast supplies the void * type expected by %p.','The displayed address is a teaching address. A real run prints its own runtime address.','&a → 0x1000 → terminal',()=>b.state.output+='&a = 0x1000\n',['a']);
  b.step('printf("p = %p\\n", (void *)p);','Print the stored address','Print the pointer value stored in p.','p and &a match because p was assigned &a.','p → 0x1000 → terminal',()=>b.state.output+='p = 0x1000\n',['p']);
  lessons.push(b.finish('printf("&p = %p\\n", (void *)&p);','&p = 0x2000\n','Print the address of the pointer variable itself. &p differs from p: 0x2000 is where the address 0x1000 is stored.'));

  b=new Trace(meta('modify','Write through a pointer','Foundations','Change an integer by following its address.','See why *p = 20 changes a while p stays the same.'),`
#include <stdio.h>

int main(void)
{
    int a = 7;
    int *p = &a;

    *p = 20;
    printf("a = %d\\n", a);
    return (0);
}`);
  b.step('int a = 7;','Create the target','Create a with value 7.','This is the integer we will change.','7 → a',()=>b.cell('a','a','int',0x1000,7));
  b.step('int *p = &a;','Connect p to a','Create p and initialize it with a copy of a’s address.','A pointer stores an address. It does not store a duplicate integer.','&a → p',()=>b.pointer('p','p','int *',0x2000,'a'),['a'],['p','a']);
  b.step('*p = 20;','Write into the target','Follow the address inside p and write 20 into that int object.','a changes from 7 to 20. The address stored in p stays 0x1000.','20 → *p → a',()=>b.set('a',20),['p'],['p','a']);
  lessons.push(b.finish('printf("a = %d\\n", a);','a = 20\n','Read a directly. It now contains the value written through p.'));

  b=new Trace(meta('arithmetic','Pointer arithmetic','Foundations','Move between consecutive array elements.','Compare p++, *(p + 1), and *p = 99.'),`
#include <stdio.h>

int main(void)
{
    int tab[3] = {10, 20, 30};
    int *p = tab;

    printf("%d\\n", *p);
    p++;
    printf("%d\\n", *(p + 1));
    *p = 99;
    printf("%d %d %d\\n", tab[0], tab[1], tab[2]);
    return (0);
}`);
  b.step('int tab[3] = {10, 20, 30};','Create consecutive elements','Create three int objects inside the array.','This model uses sizeof(int) = 4 bytes. Addresses differ by 4; real C implementations can use another int size.','10, 20, 30 → consecutive array cells',()=>b.array([10,20,30]));
  b.step('int *p = tab;','Point at the first element','Here tab converts to a pointer to its first element. Copy that address into p.','p points to tab[0]. The array is not copied.','&tab[0] → p',()=>b.pointer('p','p','int *',0x2000,'t0'),['t0'],['p','t0']);
  b.step('printf("%d\\n", *p);','Read the first element','*p reads tab[0], so printf prints 10.','Reading does not move the pointer.','p → tab[0] → 10 → terminal',()=>b.state.output+='10\n',['p','t0']);
  b.step('p++;','Move the pointer','Increment p by one int element. It now points to tab[1].','The stored address changes from 0x1000 to 0x1004. All array values stay the same.','p + 1 int element → &tab[1]',()=>b.pointer('p','p','int *',0x2000,'t1'),['p'],['p','t1']);
  b.step('printf("%d\\n", *(p + 1));','Calculate a temporary address','p + 1 reaches tab[2]; dereference that temporary address and print 30.','p itself still points to tab[1]. Calculating an address is different from assigning it to p.','p + 1 → tab[2] → 30 → terminal',()=>b.state.output+='30\n',['p','t2'],['p','t2']);
  b.step('*p = 99;','Write at the current target','p still points to tab[1], so write 99 into that element.','Only tab[1] changes. tab[0], tab[2], and p stay unchanged.','99 → *p → tab[1]',()=>b.set('t1',99),['p'],['p','t1']);
  lessons.push(b.finish('printf("%d %d %d\\n", tab[0], tab[1], tab[2]);','10 99 30\n','Print the array’s three current values. The middle value was modified through p.'));

  b=new Trace(meta('string','Chars & string addresses','Foundations','A char pointer moves one character at a time.','Read characters without changing the string.'),`
#include <stdio.h>

int main(void)
{
    char text[] = "Hello";
    char *s = text;

    putchar(*s);
    s = s + 1;
    putchar(*s);
    putchar(*(s + 1));
    putchar('\n');
    return (0);
}`.replace("putchar('\n');", "putchar('\\n');"));
  b.step('char text[] = "Hello";','Create the characters','Create H, e, l, l, o and the terminating zero character in a char array.','The zero terminator is data. It marks the end of the C string; it is not a printed character.','"Hello" → six char cells',()=>['H','e','l','l','o','\\0'].forEach((v,i)=>b.cell('c'+i,`text[${i}]`,'char',0x1000+i,v,'main',{group:'array',index:i})));
  b.step('char *s = text;','Point at H','Initialize s with the first character’s address.','Each char occupies one C byte. Neighboring addresses differ by 1.','&text[0] → s',()=>b.pointer('s','s','char *',0x2000,'c0'),['c0'],['s','c0']);
  b.step('putchar(*s);','Print H','Follow s and read H. putchar appends H to the terminal.','The string and s do not change.','s → text[0] → H → terminal',()=>b.state.output+='H',['s','c0']);
  b.step('s = s + 1;','Move to e','Calculate the next char address and store it back in s.','s changes from 0x1000 to 0x1001. The original character bytes stay the same.','s + 1 char → &text[1] → s',()=>b.pointer('s','s','char *',0x2000,'c1'),['s'],['s','c1']);
  // The identical putchar line executes a second time at its second source occurrence.
  b.step('putchar(*s);','Print e','Dereference the updated s and append e.','The same expression now reaches a different character because s changed.','s → text[1] → e → terminal',()=>b.state.output+='e',['s','c1']);
  b.steps.at(-1).line=b.code.findIndex((l,i)=>i>7&&l.trim()==='putchar(*s);')+1;
  b.step('putchar(*(s + 1));','Read the next char without moving s','The temporary address s + 1 points to text[2]. Read l there and print it.','s still stores 0x1001. No assignment to s occurs.','s + 1 → text[2] → l → terminal',()=>b.state.output+='l',['s','c2'],['s','c2']);
  lessons.push(b.finish("putchar('\\n');",'\n','Print a newline after Hel. This is the only operation here that adds the newline.'));

  b=new Trace(meta('function','ft_ft · pointer parameter','ex0','Give a function the address of a caller variable.','See that C copies the address, while *nbr reaches the caller’s integer.'),`
#include <stdio.h>

void ft_ft(int *nbr)
{
    *nbr = 42;
}

int main(void)
{
    int a = 7;

    ft_ft(&a);
    printf("a = %d\\n", a);
    return (0);
}`);
  b.step('int a = 7;','Create a in the caller','main creates a and initializes it to 7.','The function will modify this exact object.','7 → main.a',()=>b.cell('a','a','int',0x1000,7));
  b.step('ft_ft(&a);','Pass a copy of the address','Call ft_ft with &a. Its local parameter nbr receives a copy of the address 0x1000.','C passes arguments by value. The copied value is an address, so it can still reach main’s a.','main: &a → ft_ft: nbr',()=>{b.state.scope='ft_ft';b.pointer('nbr','nbr','int *',0x2000,'a','ft_ft');},['a'],['nbr','a']);
  b.step('*nbr = 42;','Modify the caller through nbr','Dereference nbr and write 42 to the caller’s a.','The local pointer’s address value stays unchanged. The caller’s integer changes.','42 → *nbr → main.a',()=>b.set('a',42),['nbr'],['nbr','a']);
  b.step('}','Return to main','ft_ft reaches its closing brace and returns. Its local parameter goes out of scope.','a keeps 42 because the function changed the caller’s object itself.','ft_ft returns → main resumes',()=>b.leave());
  lessons.push(b.finish('printf("a = %d\\n", a);','a = 42\n','main reads its updated a and prints 42.'));

  b=new Trace(meta('ultimate','ft_ultimate_ft · 9 levels','ex1','Follow a chain of pointer objects to one integer.','Each star follows one stored address; nine stars reach n.'),`
#include <stdio.h>

void ft_ultimate_ft(int *********nbr)
{
    *********nbr = 42;
}

int main(void)
{
    int n = 0;
    int *p1 = &n;
    int **p2 = &p1;
    int ***p3 = &p2;
    int ****p4 = &p3;
    int *****p5 = &p4;
    int ******p6 = &p5;
    int *******p7 = &p6;
    int ********p8 = &p7;
    int *********p9 = &p8;

    ft_ultimate_ft(p9);
    printf("n = %d\\n", n);
    return (0);
}`);
  b.step('int n = 0;','Create the final integer','Create n with value 0.','All the pointer levels will eventually lead to this one integer.','0 → n',()=>b.cell('n','n','int',0x1000,0));
  for(let i=1;i<=9;i++){
    const target=i===1?'n':'p'+(i-1);
    b.step(`int ${'*'.repeat(i)}p${i} = &${target};`,`Add pointer level ${i}`,`Create p${i} and store the address of ${target} inside it.`,i===1?'p1 points directly to the int n.':`p${i} points to a pointer object, not directly to n. ${i} dereferences from p${i} are needed to reach n.`,`&${target} → p${i}`,()=>b.pointer('p'+i,'p'+i,'int '+'*'.repeat(i),0x2000+(i-1)*8,target),[target],['p'+i,target]);
  }
  b.step('ft_ultimate_ft(p9);','Copy the outermost address','Pass the address value stored in p9 into the local parameter nbr.','nbr and p9 both point to p8. Passing p9 does not add a tenth level.','p9’s value → nbr → p8',()=>{b.state.scope='ft_ultimate_ft';b.pointer('nbr','nbr','int *********',0x3000,'p8','ft_ultimate_ft');},['p9'],['nbr','p8']);
  b.step('*********nbr = 42;','Follow nine addresses, then write','Starting at nbr, follow p8 → p7 → p6 → p5 → p4 → p3 → p2 → p1 → n. Then write 42 into n.','Only n’s integer value changes. All nine address links stay the same.','nbr → p8 → p7 → p6 → p5 → p4 → p3 → p2 → p1 → n ← 42',()=>b.set('n',42),['nbr',...Array.from({length:8},(_,i)=>'p'+(8-i)),'p1'],['nbr',...Array.from({length:8},(_,i)=>'p'+(8-i)),'n']);
  b.step('}','Return and keep the result','The local nbr disappears when ft_ultimate_ft returns.','All caller pointers still exist and lead to n = 42.','return → main',()=>b.leave());
  lessons.push(b.finish('printf("n = %d\\n", n);','n = 42\n','Read and print the single final integer after the indirect write.'));

  b=new Trace(meta('swap','ft_swap · exchange values','ex2','Save one value before overwriting it.','See the temporary copy keep the original value alive.'),`
#include <stdio.h>

void ft_swap(int *a, int *b)
{
    int tmp;

    tmp = *a;
    *a = *b;
    *b = tmp;
}

int main(void)
{
    int first = 3;
    int second = 9;

    ft_swap(&first, &second);
    printf("%d %d\\n", first, second);
    return (0);
}`);
  b.step('int first = 3;','Create first','main creates first and stores 3.','We will exchange this value with second’s value.','3 → first',()=>b.cell('first','first','int',0x1000,3));
  b.step('int second = 9;','Create second','Create a separate int named second and store 9.','These two names refer to two different memory locations.','9 → second',()=>b.cell('second','second','int',0x1004,9));
  b.step('ft_swap(&first, &second);','Pass both addresses','The local pointers a and b receive copies of &first and &second.','a points to first; b points to second. The integers are not copied into the pointer parameters.','&first → a; &second → b',()=>{b.state.scope='ft_swap';b.pointer('pa','a','int *',0x2000,'first','ft_swap');b.pointer('pb','b','int *',0x2008,'second','ft_swap');},['first','second'],['pa','pb','first','second']);
  b.step('int tmp;','Reserve the temporary','Create a local int named tmp without initializing it.','We must assign tmp before reading its value.','tmp exists; no initialized value yet',()=>b.cell('tmp','tmp','int',0x2010,undefined,'ft_swap'));
  b.step('tmp = *a;','Save the original first value','Read first through a and copy 3 into tmp.','tmp is an independent integer copy. It will not change when first changes.','a → first (3) → tmp',()=>b.set('tmp',3),['pa','first'],['first','tmp']);
  b.step('*a = *b;','Copy second into first','Read second through b, then write that value through a into first.','Both caller integers now contain 9. tmp still preserves the original 3.','b → second (9) → *a → first',()=>b.set('first',9),['pb','second','pa'],['second','first']);
  b.step('*b = tmp;','Write the saved value into second','Copy tmp’s 3 into second through b.','The swap is complete: first = 9 and second = 3. Pointer addresses never changed.','tmp (3) → *b → second',()=>b.set('second',3),['tmp','pb'],['tmp','second']);
  b.step('}','Return from ft_swap','a, b, and tmp leave scope when the function returns.','The swapped values remain in main’s objects.','ft_swap returns → main',()=>b.leave());
  lessons.push(b.finish('printf("%d %d\\n", first, second);','9 3\n','main prints the two swapped values.'));

  b=new Trace(meta('divmod','ft_div_mod · output parameters','ex3','Write two results into two caller variables.','Distinguish copied input integers from copied output addresses.'),`
#include <stdio.h>

void ft_div_mod(int a, int b, int *div, int *mod)
{
    *div = a / b;
    *mod = a % b;
}

int main(void)
{
    int quotient = 0;
    int remainder = 0;

    ft_div_mod(17, 5, &quotient, &remainder);
    printf("%d %d\\n", quotient, remainder);
    return (0);
}`);
  b.step('int quotient = 0;','Create the first output object','Create quotient in main and initialize it to 0.','The function will write a result at this address.','0 → quotient',()=>b.cell('q','quotient','int',0x1000,0));
  b.step('int remainder = 0;','Create the second output object','Create remainder with value 0.','A separate output object lets the function supply a second result.','0 → remainder',()=>b.cell('r','remainder','int',0x1004,0));
  b.step('ft_div_mod(17, 5, &quotient, &remainder);','Copy inputs and output addresses','a receives 17, b receives 5, div receives &quotient, and mod receives &remainder.','All four arguments are passed by value. Two values are integers and two are addresses. The divisor here is nonzero.','17 → a; 5 → b; &quotient → div; &remainder → mod',()=>{b.state.scope='ft_div_mod';b.cell('a','a','int',0x2000,17,'ft_div_mod');b.cell('b','b','int',0x2004,5,'ft_div_mod');b.pointer('div','div','int *',0x2010,'q','ft_div_mod');b.pointer('mod','mod','int *',0x2018,'r','ft_div_mod');},['q','r'],['div','q','mod','r']);
  b.step('*div = a / b;','Write the quotient','Integer division 17 / 5 yields 3. Write 3 into quotient through div.','The input copies a and b stay 17 and 5. Only the first output changes.','a / b = 3 → *div → main.quotient',()=>b.set('q',3),['a','b','div'],['div','q']);
  b.step('*mod = a % b;','Write the remainder','17 % 5 yields 2. Write 2 into remainder through mod.','17 = 3 × 5 + 2. Two caller objects now hold the two results.','a % b = 2 → *mod → main.remainder',()=>b.set('r',2),['a','b','mod'],['mod','r']);
  b.step('}','Return with two outputs','Local inputs and pointer parameters go out of scope.','The function has void return type. The results remain in the output objects.','return → caller outputs remain',()=>b.leave());
  lessons.push(b.finish('printf("%d %d\\n", quotient, remainder);','3 2\n','Print the quotient and remainder stored in main.'));

  b=new Trace(meta('ultdiv','ft_ultimate_div_mod · overwrite','ex4','Turn the original inputs into outputs safely.','Preserve both results before overwriting either input.'),`
#include <stdio.h>

void ft_ultimate_div_mod(int *a, int *b)
{
    int quotient;
    int remainder;

    quotient = *a / *b;
    remainder = *a % *b;
    *a = quotient;
    *b = remainder;
}

int main(void)
{
    int first = 17;
    int second = 5;

    ft_ultimate_div_mod(&first, &second);
    printf("%d %d\\n", first, second);
    return (0);
}`);
  b.step('int first = 17;','Create the numerator','Create first with value 17.','This location starts as an input and will become the quotient output.','17 → first',()=>b.cell('first','first','int',0x1000,17));
  b.step('int second = 5;','Create the divisor','Create second with the nonzero value 5.','This location will later hold the remainder.','5 → second',()=>b.cell('second','second','int',0x1004,5));
  b.step('ft_ultimate_div_mod(&first, &second);','Pass the input addresses','Copy &first into a and &second into b.','Dereferencing the parameters accesses main’s original integers.','&first → a; &second → b',()=>{b.state.scope='ft_ultimate_div_mod';b.pointer('pa','a','int *',0x2000,'first',b.state.scope);b.pointer('pb','b','int *',0x2008,'second',b.state.scope);},['first','second'],['pa','pb','first','second']);
  b.step('int quotient;','Create quotient','Reserve local storage for the quotient.','It has no initialized value until the assignment.','local quotient created',()=>b.cell('q','quotient','int',0x2010,undefined,b.state.scope));
  b.step('int remainder;','Create remainder','Reserve local storage for the remainder.','We will compute both results before changing the caller.','local remainder created',()=>b.cell('r','remainder','int',0x2014,undefined,b.state.scope));
  b.step('quotient = *a / *b;','Save the quotient','Read 17 and 5 through a and b, compute 3, and store it in local quotient.','Both original input values still exist in main.','*a / *b = 3 → quotient',()=>b.set('q',3),['pa','pb','first','second'],['q']);
  b.step('remainder = *a % *b;','Save the remainder','Read the original 17 and 5 again and save remainder 2.','Computing this after overwriting first with 3 would produce the wrong result.','*a % *b = 2 → remainder',()=>b.set('r',2),['pa','pb','first','second'],['r']);
  b.step('*a = quotient;','Replace the first input','Copy local quotient into first through a.','first changes from 17 to 3. The remainder was already saved.','quotient (3) → *a → first',()=>b.set('first',3),['q','pa'],['first']);
  b.step('*b = remainder;','Replace the second input','Copy local remainder into second through b.','The original caller objects now hold quotient 3 and remainder 2.','remainder (2) → *b → second',()=>b.set('second',2),['r','pb'],['second']);
  b.step('}','Return to the caller','The local result copies and pointer parameters leave scope.','first and second retain their overwritten values.','return → main',()=>b.leave());
  lessons.push(b.finish('printf("%d %d\\n", first, second);','3 2\n','Print the results now stored in the original caller variables.'));

  b=new Trace(meta('reverse','ft_rev_int_tab · reversal','ex5','Exchange opposite elements until the middle.','Watch every temporary copy, write, and loop condition.'),`
#include <stdio.h>

void ft_rev_int_tab(int *tab, int size)
{
    int i;
    int tmp;

    i = 0;
    while (i < size / 2)
    {
        tmp = tab[i];
        tab[i] = tab[size - 1 - i];
        tab[size - 1 - i] = tmp;
        i++;
    }
}

int main(void)
{
    int tab[5] = {1, 2, 3, 4, 5};

    ft_rev_int_tab(tab, 5);
    printf("%d %d %d %d %d\\n", tab[0], tab[1], tab[2], tab[3], tab[4]);
    return (0);
}`);
  b.step('int tab[5] = {1, 2, 3, 4, 5};','Create the caller array','Initialize five consecutive int elements.','The first and last elements will exchange values, then the inner pair.','1, 2, 3, 4, 5 → array cells',()=>b.array([1,2,3,4,5]));
  b.step('ft_rev_int_tab(tab, 5);','Pass the first address and size','The local tab parameter gets &tab[0]. The local size receives 5.','The pointer parameter and the caller’s array have the same name, but they are different objects. Only the address is passed.','&main.tab[0] → parameter tab; 5 → size',()=>{b.state.scope='ft_rev_int_tab';b.pointer('tab','tab','int *',0x2000,'t0',b.state.scope);b.cell('size','size','int',0x2008,5,b.state.scope);},['t0'],['tab','t0']);
  b.step('int i;','Create the index','Create local i, not initialized yet.','i will count the left-hand position.','local i created',()=>b.cell('i','i','int',0x200C,undefined,b.state.scope));
  b.step('int tmp;','Create the temporary','Create local tmp, not initialized yet.','It will preserve the left value while that cell is overwritten.','local tmp created',()=>b.cell('tmp','tmp','int',0x2010,undefined,b.state.scope));
  b.step('i = 0;','Start at the left','Initialize i to 0.','The opposite index is size - 1 - i = 4.','0 → i',()=>b.set('i',0));
  for(let i=0;i<2;i++){
    const j=4-i,lv=b.state.cells['t'+i].value,rv=b.state.cells['t'+j].value;
    b.step('while (i < size / 2)','Check the loop condition',`${i} < 5 / 2 evaluates to ${i} < 2, which is true. Enter the loop body.`,'Integer division gives 2. We swap two pairs, leaving the middle element unchanged.',`i (${i}) < size / 2 (2) → true`,()=>{},['i','size'],['t'+i,'t'+j]);
    b.step('tmp = tab[i];','Save the left value',`tab[${i}] is ${lv}. Copy it into tmp.`,`tab[${i}] means *(tab + ${i}); the element address is ${address(0x1000+i*4)}.`,`tab + ${i} → ${lv} → tmp`,()=>b.set('tmp',lv),['tab','i','t'+i],['t'+i,'tmp']);
    b.step('tab[i] = tab[size - 1 - i];','Move the right value left',`The opposite index is 5 - 1 - ${i} = ${j}. Copy value ${rv} into tab[${i}].`,'Both pair cells briefly contain the right value. tmp preserves the old left value.',`tab[${j}] (${rv}) → tab[${i}]`,()=>b.set('t'+i,rv),['tab','size','i','t'+j],['t'+i,'t'+j]);
    b.step('tab[size - 1 - i] = tmp;','Restore the saved value on the right',`Copy tmp’s ${lv} into tab[${j}].`,'This pair is now reversed. The base pointer tab did not move.',`tmp (${lv}) → tab[${j}]`,()=>b.set('t'+j,lv),['tmp','tab','size','i'],['t'+i,'t'+j]);
    b.step('i++;','Move one pair inward',`Increment i from ${i} to ${i+1}.`,'Only the local index changes. Array values stay unchanged.',`i + 1 → i`,()=>b.set('i',i+1),['i']);
  }
  b.step('while (i < size / 2)','Stop at the middle','2 < 2 is false, so the loop ends.','tab[2] is the middle element and remains 3.','2 < 2 → false',()=>{},['i','size'],['t2']);
  b.step('}','Return from reversal','The function returns; local tab, size, i, and tmp go out of scope.','The caller’s array remains reversed.','return → main',()=>b.leave());
  // Select the function closing brace rather than the loop closing brace.
  b.steps.at(-1).line=b.code.findIndex((l,i)=>i>10&&l==='}')+1;
  lessons.push(b.finish('printf("%d %d %d %d %d\\n", tab[0], tab[1], tab[2], tab[3], tab[4]);','5 4 3 2 1\n','main prints the reversed array.'));

  b=new Trace(meta('sort','ft_sort_int_tab · sorting','ex6','Build ascending order with neighboring comparisons.','Watch comparisons that write and comparisons that leave memory unchanged.'),`
#include <stdio.h>

void ft_sort_int_tab(int *tab, int size)
{
    int pass;
    int i;
    int tmp;

    pass = 0;
    while (pass < size - 1)
    {
        i = 0;
        while (i < size - 1 - pass)
        {
            if (tab[i] > tab[i + 1])
            {
                tmp = tab[i];
                tab[i] = tab[i + 1];
                tab[i + 1] = tmp;
            }
            i++;
        }
        pass++;
    }
}

int main(void)
{
    int tab[4] = {4, 1, 3, 2};

    ft_sort_int_tab(tab, 4);
    printf("%d %d %d %d\\n", tab[0], tab[1], tab[2], tab[3]);
    return (0);
}`);
  b.step('int tab[4] = {4, 1, 3, 2};','Create the unsorted array','Create four int elements: 4, 1, 3, 2.','Sorting changes the values in these same cells, not the cells’ addresses.','4, 1, 3, 2 → array',()=>b.array([4,1,3,2]));
  b.step('ft_sort_int_tab(tab, 4);','Pass array access to the function','Copy the first element’s address into tab and copy 4 into size.','The function can read and write the original array through this copied address.','&main.tab[0] → tab; 4 → size',()=>{b.state.scope='ft_sort_int_tab';b.pointer('tab','tab','int *',0x2000,'t0',b.state.scope);b.cell('size','size','int',0x2008,4,b.state.scope);},['t0'],['tab','t0']);
  for(const [id,loc] of [['pass',0x200C],['i',0x2010],['tmp',0x2014]]) b.step(`int ${id};`,`Create ${id}`,`Reserve local int storage for ${id}.`,id==='tmp'?'tmp will preserve one value during each swap.':`${id} will control the comparisons. It must be initialized before it is read.`,`local ${id} created`,()=>b.cell(id,id,'int',loc,undefined,b.state.scope));
  b.step('pass = 0;','Start the first pass','Set pass to 0.','After each full pass, the largest remaining value will be at the right of the unsorted region.','0 → pass',()=>b.set('pass',0));
  for(let pass=0;pass<3;pass++){
    b.step('while (pass < size - 1)',`Begin pass ${pass+1}`,`${pass} < 4 - 1 is true. Enter this pass.`,'The rightmost completed elements need no further comparisons.',`${pass} < 3 → true`,()=>{},['pass','size']);
    b.step('i = 0;','Start from the left','Set i to 0 for this pass.','The first comparison is tab[0] against tab[1].','0 → i',()=>b.set('i',0));
    for(let i=0;i<3-pass;i++){
      b.step('while (i < size - 1 - pass)','Check the inner loop',`${i} < 4 - 1 - ${pass} is true. Compare the next neighboring pair.`,`The indices are ${i} and ${i+1}; both are inside the array.`,`${i} < ${3-pass} → true`,()=>{},['i','size','pass'],['t'+i,'t'+(i+1)]);
      const left=b.state.cells['t'+i].value,right=b.state.cells['t'+(i+1)].value,swap=left>right;
      b.step('if (tab[i] > tab[i + 1])','Compare the two values',`${left} > ${right} is ${swap?'true. Execute the three swap assignments.':'false. Skip the swap body.'}`,swap?'A comparison only reads. The actual changes happen in the following assignments.':'This pair is already ordered. No array values change.',`tab[${i}] (${left}) > tab[${i+1}] (${right}) → ${swap}`,()=>{},['tab','i','t'+i,'t'+(i+1)],['t'+i,'t'+(i+1)]);
      if(swap){
        b.step('tmp = tab[i];','Save the left value',`Copy ${left} from tab[${i}] into tmp.`,'This is an independent value copy, not a pointer.',`tab[${i}] → tmp (${left})`,()=>b.set('tmp',left),['tab','i','t'+i],['tmp','t'+i]);
        b.step('tab[i] = tab[i + 1];','Move the smaller value left',`Copy ${right} from tab[${i+1}] into tab[${i}].`,`Both cells briefly contain ${right}; tmp preserves ${left}.`,`tab[${i+1}] → tab[${i}]`,()=>b.set('t'+i,right),['tab','i','t'+(i+1)],['t'+i,'t'+(i+1)]);
        b.step('tab[i + 1] = tmp;','Move the saved value right',`Copy tmp’s ${left} into tab[${i+1}].`,'The neighboring pair is now ascending. The base pointer stays at tab[0].',`tmp (${left}) → tab[${i+1}]`,()=>b.set('t'+(i+1),left),['tmp','tab','i'],['t'+i,'t'+(i+1)]);
      }
      b.step('i++;','Move to the next pair',`Increment i from ${i} to ${i+1}.`,'The loop condition will decide whether another pair needs comparing.','i + 1 → i',()=>b.set('i',i+1),['i']);
    }
    b.step('while (i < size - 1 - pass)','Finish this inner loop',`${3-pass} < ${3-pass} is false. Leave the inner loop.`,'This pass’s largest remaining value is now at its final position.',`${3-pass} < ${3-pass} → false`,()=>{},['i','size','pass'],['t'+(3-pass)]);
    b.step('pass++;','Finish the pass',`Increment pass from ${pass} to ${pass+1}.`,'The unsorted region shrinks by one element on the right.','pass + 1 → pass',()=>b.set('pass',pass+1),['pass']);
  }
  b.step('while (pass < size - 1)','Stop after the required passes','3 < 3 is false. The outer loop ends.','The array is now 1, 2, 3, 4. Even the final comparison that required no swap was executed.','3 < 3 → false',()=>{},['pass','size']);
  b.step('}','Return from sorting','Local pointers and counters go out of scope.','The caller’s original array remains sorted.','return → main',()=>b.leave());
  b.steps.at(-1).line=b.code.findIndex((l,i)=>i>20&&l==='}')+1;
  lessons.push(b.finish('printf("%d %d %d %d\\n", tab[0], tab[1], tab[2], tab[3]);','1 2 3 4\n','main prints the ascending array.'));
  return lessons;
}

export class Controller {
  constructor(lessons){this.lessons=lessons;this.lessonIndex=0;this.index=0;}
  get lesson(){return this.lessons[this.lessonIndex];}
  get frame(){return this.lesson.steps[this.index];}
  get before(){return this.lesson.steps[Math.max(0,this.index-1)];}
  get atEnd(){return this.index===this.lesson.steps.length-1;}
  seek(n){this.index=Math.max(0,Math.min(this.lesson.steps.length-1,Math.round(Number(n)||0)));}
  next(){this.seek(this.index+1);}
  previous(){this.seek(this.index-1);}
  reset(){this.index=0;}
  select(id){const i=this.lessons.findIndex(l=>l.id===id);if(i>=0){this.lessonIndex=i;this.reset();}}
}
