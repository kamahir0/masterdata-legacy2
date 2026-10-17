// A rejected action must not poison later input. Each caller retains its own
// result; the queue serializes work without silently dropping an enabled click.
export class SerialActions {
  private tail:Promise<unknown>=Promise.resolve();
  size=0;
  idle(){return this.tail;}
  run<T>(action:()=>Promise<T>):Promise<T> {
    this.size++;
    const result=this.tail.then(action);
    this.tail=result.catch(()=>undefined).finally(()=>{this.size--;});
    return result;
  }
}
