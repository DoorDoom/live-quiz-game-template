import { WebSocket } from "ws";
import { UserStorage } from "./storages/userStorage";
import {
  AnswerData,
  CreateGameData,
  Game,
  JoinGameData,
  Player,
  RegData,
  User,
  WSMessage,
} from "./types";
import { GameStorage } from "./storages/gameStorage";

export class MessageHander {
  userStorage = new UserStorage();
  gameStorage = new GameStorage();

  commands = new Map<string, (data: any, ws: WebSocket) => Promise<any>>([
    [
      "reg",
      async (data: RegData, ws: WebSocket) => {
        const response = {
          type: "reg",
          id: 0,
          data: {},
        };

        const { name, index } = this.userStorage.addUser(
          data.name,
          data.password,
          ws,
        );

        response.data = { name, index, error: false, errorText: "" };
        return response;
      },
    ],
    [
      "create_game",
      async (data: CreateGameData, ws: WebSocket) => {
        const response = {
          type: "game_created",
          id: 0,
          data: {},
        };

        const user = this.userStorage.findbyWebsocket(ws);

        if (!user) {
          throw new Error("no such user");
        }

        const { id, code } = this.gameStorage.addGame(
          user.index,
          data.questions,
        );

        response.data = { gameId: id, code };
        return response;
      },
    ],
    [
      "join_game",
      async (data: JoinGameData, ws: WebSocket) => {
        const response = {
          type: "game_joined",
          id: 0,
          data: {},
        };

        const user = this.userStorage.findbyWebsocket(ws);

        if (!user || user.ws?.readyState !== WebSocket.OPEN) {
          throw new Error("no such user");
        }

        const newPlayer = this.userStorage.generatePlayer(user);
        const game = this.gameStorage.joinGame(newPlayer, data.code);

        if (!game) {
          throw new Error("no such game");
        }

        this.updatePlayerList(game, newPlayer);

        response.data = { gameId: game.id };
        return response;
      },
    ],
    [
      "start_game",
      async (data: { gameId: string }, ws: WebSocket) => {
        const user = this.userStorage.findbyWebsocket(ws);

        if (!user || user.ws?.readyState !== WebSocket.OPEN) {
          throw new Error("no such user");
        }

        const game = this.gameStorage.findGameById(data.gameId);

        if (!game) {
          throw new Error("no such game");
        }

        if (user.index !== game.hostId) throw Error("no host");

        this.startGame(game, user);

        return {};
      },
    ],
    [
      "answer",
      async (data: AnswerData, ws: WebSocket) => {
        const response = {
          type: "answer_accepted",
          id: 0,
          data: {},
        };

        const user = this.userStorage.findbyWebsocket(ws);

        if (!user || user.ws?.readyState !== WebSocket.OPEN) {
          throw new Error("no such user");
        }

        const game = this.gameStorage.findGameById(data.gameId);

        if (!game) {
          throw new Error("no such game");
        }

        this.gameStorage.updateQuestion(game, user.index, data.answerIndex);

        if (game.playerAnswers.size === game.players.length) {
          clearTimeout(game.questionTimer);

          this.sendResult(game);
        }

        response.data = { questionIndex: data.questionIndex };
        return response;
      },
    ],
  ]);

  handleMessage = async (message: WSMessage, ws: WebSocket) => {
    console.log("received:", message);

    try {
      if (this.commands.has(message.type)) {
        return await this.commands.get(message.type)!(message.data, ws);
      } else {
        console.warn("Unknown message type:", message.type);
        return {
          data: { error: true, errorText: "Unknown message type" },
          id: 0,
        };
      }
    } catch (err) {
      console.error("Error handling message:", err);
      return {
        data: { error: true, errorText: "Internal server error" },
        id: 0,
      };
    }
  };

  updatePlayerList = async (game: Game, player: Player) => {
    const playerMessage = {
      type: "player_joined",
      id: 0,
      data: {},
    };

    const updatePlayerListMessage = {
      type: "update_players",
      id: 0,
      data: new Array<{ name: string; index: string; score: number }>(),
    };

    const host = this.userStorage.findbyIndex(game.hostId);

    if (!host || host.ws?.readyState !== WebSocket.OPEN)
      throw new Error("no such host");

    playerMessage.data = {
      playerName: player.name,
      playerCount: player.score,
    };

    game.players.forEach((player) => {
      updatePlayerListMessage.data.push({
        name: player.name,
        index: player.index,
        score: player.score,
      });
    });

    this.gameStorage.sendToActiveUsers(
      game,
      host,
      updatePlayerListMessage,
      () => {
        player.ws!.send(JSON.stringify(playerMessage));
      },
    );
  };

  startGame = async (game: Game, host: User) => {
    const response = {
      type: "question",
      id: 0,
      data: {},
    };

    response.data = this.gameStorage.startQuestion(game, this.sendResult);

    game.status = "in_progress";

    this.gameStorage.sendToActiveUsers(game, host, response);
  };

  sendResult = (game: Game) => {
    const host = this.userStorage.findbyIndex(game.hostId);

    if (!host || host.ws?.readyState !== WebSocket.OPEN)
      throw new Error("no such host");

    const resultResponse = {
      type: "question_result",
      id: 0,
      data: this.gameStorage.finishQuestion(game),
    };

    game.currentQuestion++;

    if (game.currentQuestion < game.questions.length) {
      game.questionTimer = setTimeout(() => {
        this.startGame(game, host);
      }, 5000);
    } else {
      game.questionTimer = setTimeout(() => {
        const finishResponse = {
          type: "game_finished",
          id: 0,
          data: this.gameStorage.finishGame(game),
        };

        game.status = "finished";

        this.gameStorage.sendToActiveUsers(game, host, finishResponse);
      }, 5000);
    }

    this.gameStorage.sendToActiveUsers(game, host, resultResponse);
  };
}
