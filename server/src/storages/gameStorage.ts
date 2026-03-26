import { Game, Player, Question, User } from "../types";

export class GameStorage {
  storage: Map<string, Game> = new Map();

  addGame(hostId: string, questions: Question[]): Game {
    const id = `${Date.now()}-${Math.random()}`;
    const code =
      [...Array(4)]
        .map(() => String.fromCharCode(65 + Math.floor(Math.random() * 26)))
        .join("") + Math.floor(Math.random() * 90 + 10);
    const game: Game = {
      id,
      hostId,
      questions,
      code,
      players: [],
      currentQuestion: 0,
      status: "waiting",
      playerAnswers: new Map(),
    };
    this.storage.set(code, game);
    return game;
  }

  joinGame(player: Player, code: string): Game | null {
    const game = this.storage.get(code);
    if (!game) return null;

    game?.players.push(player);
    return game;
  }

  findGameByCode(code: string) {
    return this.storage.get(code);
  }

  findGameById(index: string): Game | null {
    for (let [key, value] of this.storage) {
      if (value.id === index) return value;
    }
    return null;
  }
}
