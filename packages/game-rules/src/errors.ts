export class InvalidBattleSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBattleSetupError';
  }
}

export class IllegalBattleActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalBattleActionError';
  }
}
