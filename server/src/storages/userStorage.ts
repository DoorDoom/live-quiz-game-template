import type { WebSocket } from "ws";
import { Player, User } from "../types";

export class UserStorage {
  userStorage: Map<string, User> = new Map();

  addUser(name: string, password: string, ws: WebSocket): User {
    const index = `${Date.now()}-${Math.random()}`;
    const user: User = { name, password, index, ws };
    this.userStorage.set(index, user);
    return user;
  }

  findbyIndex(index: string) {
    return this.userStorage.get(index);
  }

  findbyWebsocket(ws: WebSocket): User | null {
    for (let [key, value] of this.userStorage) {
      if (value.ws === ws) return value;
    }
    return null;
  }

  generatePlayer(user: User): Player {
    return {
      name: user.name,
      index: user.index,
      score: 0,
      ws: user.ws,
    };
  }
}
