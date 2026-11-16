import React from 'react';
import { CARTRIDGES, CartridgePlayer } from './GameShelfTool';

/**
 * Individual cupboard cards for each bundled arcade title.
 * All of them share one lazy chunk (this module); the games themselves are
 * static HTML in public/games/ and never touch the network.
 */
const makeCartridgeTool = (id: string): React.FC => {
  const CartridgeTool: React.FC = () => {
    const game = CARTRIDGES.find((c) => c.id === id);
    if (!game) {
      return (
        <p className="rounded-xl border-2 border-[#D9B68C] bg-[#FFFDF8] p-6 text-sm font-bold text-[#8B5A2B]">
          That cartridge is missing from the shelf.
        </p>
      );
    }
    return <CartridgePlayer game={game} />;
  };
  return CartridgeTool;
};

export const arcade2048 = makeCartridgeTool('2048');
export const arcadeTrapTheCat = makeCartridgeTool('trap-the-cat');
export const arcadeWordle = makeCartridgeTool('wordle-unlimited');
export const arcadeSandGame = makeCartridgeTool('sand-game');
export const arcadeFluid = makeCartridgeTool('fluidsimulator');
export const arcadeOfflineParadise = makeCartridgeTool('offlineparadise');
export const arcadeRadiusRaid = makeCartridgeTool('radiusraid');
export const arcadeRainingBoxes = makeCartridgeTool('itsrainingboxes');
export const arcadeNinja = makeCartridgeTool('ninjavsevilcorp');
export const arcadeAgar = makeCartridgeTool('agar-io-lite');
export const arcadePaper = makeCartridgeTool('paper-io-2');
