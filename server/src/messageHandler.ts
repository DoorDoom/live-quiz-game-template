import { WebSocket } from "ws";
import { UserStorage } from "./storages/userStorage";
import {
  CreateGameData,
  Game,
  JoinGameData,
  Player,
  RegData,
  User,
  WSMessage,
} from "./types";
import { GameStorage } from "./storages/gameStorage";
import { error } from "console";

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
          throw Error("no such user");
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
          throw Error("no such user");
        }

        const newPlayer = this.userStorage.generatePlayer(user);
        const game = this.gameStorage.joinGame(newPlayer, data.code);

        if (!game) {
          throw Error("no such game");
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
          throw Error("no such user");
        }

        const game = this.gameStorage.findGameById(data.gameId);

        if (!game) {
          throw Error("no such game");
        }

        if (user.index !== game.hostId) throw Error("no host");

        this.startGame(game, user);

        return {};
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
      throw Error("no such host");

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

    game.players.forEach((player) => {
      if (!player || player.ws?.readyState !== WebSocket.OPEN)
        throw Error("no such player");
      player.ws.send(JSON.stringify(playerMessage));
      player.ws.send(JSON.stringify(updatePlayerListMessage));
    });

    host.ws.send(JSON.stringify(updatePlayerListMessage));
  };

  startGame = async (game: Game, host: User) => {
    const response = {
      type: "question",
      id: 0,
      data: {},
    };

    response.data = {
      ...game.questions[0],
      correctIndex: -1,
      questionNumber: 0,
      totalQuestions: game.questions.length,
    };

    game.players.forEach((player) => {
      if (!player || player.ws?.readyState !== WebSocket.OPEN)
        throw Error("no such player");
      player.ws.send(JSON.stringify(response));
    });

    host.ws!.send(JSON.stringify(response));
  };
}
