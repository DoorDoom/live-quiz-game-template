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
    this.storage.set(id, game);
    return game;
  }

  deleteGame(game: Game) {
    this.storage.delete(game.id);
  }

  joinGame(player: Player, code: string): Game | null {
    const game = this.findGameByCode(code);
    if (!game) return null;

    game?.players.push(player);
    return game;
  }

  findGameByCode(code: string): Game | null {
    for (let [key, value] of this.storage) {
      if (value.code === code) return value;
    }
    return null;
  }

  findGameById(index: string) {
    return this.storage.get(index);
  }

  startQuestion(game: Game, finishFn: (game: Game) => void) {
    const currentQuestion = game.questions[game.currentQuestion];
    const response = {
      ...currentQuestion,
      correctIndex: game.currentQuestion,
      questionNumber: 0,
      totalQuestions: game.questions.length,
    };

    game.questionStartTime = Math.floor(Date.now() / 1000);
    game.questionTimer = setTimeout(
      () => finishFn(game),
      currentQuestion.timeLimitSec * 1000,
    );

    return response;
  }

  updateQuestion(game: Game, player: string, answerIndex: number) {
    game.playerAnswers.set(player, {
      answerIndex,
      timestamp: Math.floor(Date.now() / 1000),
    });
  }

  finishQuestion(game: Game) {
    const currentQuestion = game.questions[game.currentQuestion];

    const playerResults: {
      name: string;
      answered: boolean;
      correct: boolean;
      pointsEarned: number;
      totalScore: number;
    }[] = [];

    game.players.forEach((player, ind) => {
      const answer = game.playerAnswers.get(player.index);
      if (!answer) {
        if (player.ws?.readyState !== WebSocket.OPEN)
          game.players.splice(ind, 1);

        playerResults.push({
          name: player.name,
          answered: false,
          correct: false,
          pointsEarned: 0,
          totalScore: player.score,
        });
      } else {
        const isCorrect = answer.answerIndex === currentQuestion.correctIndex;
        let earnedPoints = 0;

        if (isCorrect)
          earnedPoints = Math.floor(
            1000 *
              (1 -
                (answer.timestamp - game.questionStartTime!) /
                  currentQuestion.timeLimitSec),
          );

        player.score += earnedPoints;

        playerResults.push({
          name: player.name,
          answered: true,
          correct: isCorrect,
          pointsEarned: earnedPoints,
          totalScore: player.score,
        });
      }
    });

    const result = {
      questionIndex: game.currentQuestion,
      correctIndex: currentQuestion.correctIndex,
      playerResults,
    };

    game.playerAnswers.clear();

    return result;
  }

  finishGame(game: Game) {
    const result = {
      scoreboard: new Array<{
        name: string;
        score: number;
        rank: number;
      }>(),
    };

    game.players
      .sort((a, b) => b.score - a.score)
      .forEach((player, ind) =>
        result.scoreboard.push({
          name: player.name,
          score: player.score,
          rank: ind + 1,
        }),
      );

    return result;
  }

  sendToHost(host: User, message: Object) {
    if (!host || host.ws?.readyState !== WebSocket.OPEN)
      throw new Error("no such host");
    host.ws.send(JSON.stringify(message));
  }

  sendToActiveUsers(game: Game, message: Object, fn?: () => void) {
    game.players.forEach((player, ind) => {
      if (!player || player.ws?.readyState !== WebSocket.OPEN)
        game.players.splice(ind, 1);
      else {
        if (fn) fn();
        player.ws.send(JSON.stringify(message));
      }
    });
  }
}
