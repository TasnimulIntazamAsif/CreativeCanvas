import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { EditorCore } from "../index";
import { Command } from "../../commands";
import { consoleToast } from "../../adapters/default/console-toast";
import { anonymousAuthUser } from "../../adapters/default/anonymous-auth-user";
import { downloadExportSink } from "../../adapters/default/download-export-sink";
import { emptySoundsAdapter } from "../../adapters/default/empty-sounds-adapter";
import type { VideoEditorAdapters } from "../../adapters";

// CommandManager.collapseHistorySince folds several executed commands into a
// single undo step (used so one AI edit request undoes with one Ctrl+Z).

describe("CommandManager.collapseHistorySince", () => {
  beforeEach(() => {
    EditorCore.initialize({ adapters: buildAdapters() });
  });

  afterEach(() => {
    EditorCore.reset();
  });

  test("undoes and redoes the grouped commands as one step", () => {
    const editor = EditorCore.getInstance();
    const log: string[] = [];
    const start = editor.command.getHistoryLength();

    for (const name of ["a", "b", "c"]) {
      editor.command.execute({ command: new LoggingCommand(name, log) });
    }
    editor.command.collapseHistorySince({ startLength: start });
    expect(editor.command.getHistoryLength()).toBe(start + 1);

    log.length = 0;
    editor.command.undo();
    expect(log).toEqual(["undo c", "undo b", "undo a"]);

    log.length = 0;
    editor.command.redo();
    expect(log).toEqual(["do a", "do b", "do c"]);
  });

  test("keeps earlier entries and leaves a single new entry as is", () => {
    const editor = EditorCore.getInstance();
    const log: string[] = [];

    editor.command.execute({ command: new LoggingCommand("before", log) });
    const start = editor.command.getHistoryLength();
    editor.command.execute({ command: new LoggingCommand("only", log) });
    editor.command.collapseHistorySince({ startLength: start });
    expect(editor.command.getHistoryLength()).toBe(start + 1);

    log.length = 0;
    editor.command.undo();
    editor.command.undo();
    expect(log).toEqual(["undo only", "undo before"]);
  });
});

class LoggingCommand extends Command {
  constructor(
    private readonly name: string,
    private readonly log: string[],
  ) {
    super();
  }

  execute() {
    this.log.push(`do ${this.name}`);
    return undefined;
  }

  override undo() {
    this.log.push(`undo ${this.name}`);
  }
}

function buildAdapters(): VideoEditorAdapters {
  return {
    projectStorage: {
      async loadProject() {
        return null;
      },
      async saveProject() {},
      async deleteProject() {},
      async listProjects() {
        return [];
      },
      async createProject(name: string) {
        return { id: "proj-1", name, updatedAt: Date.now(), data: null };
      },
    },
    mediaSource: {
      async resolveMedia() {
        return { url: "blob:test", mime: "video/mp4" };
      },
      async uploadLocalFile(file: File) {
        return { id: `media-${file.name}`, kind: "video" };
      },
    },
    authUser: anonymousAuthUser,
    exportSink: downloadExportSink,
    toast: consoleToast,
    soundsAdapter: emptySoundsAdapter,
    assetGallery: null,
  };
}
