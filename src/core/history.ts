// История состояний для «шаг назад» / «шаг вперёд».
// Хранит снимки целиком: вперёд восстанавливается ровно то, что было, без повторного расчёта.
// Новый ход после шага назад отбрасывает ветку «вперёд».

export class History<T> {
  private readonly states: T[];
  private index = 0;

  constructor(initial: T) {
    this.states = [initial];
  }

  get current(): T {
    return this.states[this.index]!;
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.states.length - 1;
  }

  push(state: T): void {
    this.states.splice(this.index + 1);
    this.states.push(state);
    this.index++;
  }

  undo(): T | null {
    if (!this.canUndo) return null;
    this.index--;
    return this.current;
  }

  redo(): T | null {
    if (!this.canRedo) return null;
    this.index++;
    return this.current;
  }
}
