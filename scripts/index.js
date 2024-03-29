import { DynamicPropertiesDefinition, MinecraftEntityTypes, world, MinecraftBlockTypes, ItemStack } from "@minecraft/server"

world.afterEvents.worldInitialize.subscribe((event) => {
    const propertiesDefinition = new DynamicPropertiesDefinition();
    propertiesDefinition.defineBoolean('treecap');
    propertiesDefinition.defineBoolean('cutting');
    event.propertyRegistry.registerEntityTypeDynamicProperties(propertiesDefinition, MinecraftEntityTypes.player);
});
world.afterEvents.itemUse.subscribe((event) => {
    const player = event.source
    const item = player.getComponent("minecraft:inventory").container.getItem(player.selectedSlot); 
    if (item == undefined || !item.hasTag("minecraft:is_axe") || !player.isSneaking) return; //Check if player has axe in hand and is sneaking, will only work if they have an axe
    if (!player.getDynamicProperty('treecap')) {
        player.setDynamicProperty('treecap', true);
        player.setDynamicProperty('cutting', false);
        player.onScreenDisplay.setActionBar("Treechop On");
    } else {
        player.setDynamicProperty('treecap', false);
        player.onScreenDisplay.setActionBar("Treechop Off");
    }
})

world.afterEvents.blockBreak.subscribe(async (event) => { 
    const player = event.player;
    if (player.getDynamicProperty('cutting')) { player.onScreenDisplay.setActionBar("Wait for the other tree to finish falling!"); return; }
    if (!player.getDynamicProperty('treecap')) return;
    const block = event.brokenBlockPermutation;
    if (!isLog(block)) return; //Check if broken block is log, easy filter check first
    const slot = player.getComponent("minecraft:inventory").container.getSlot(player.selectedSlot);
    const item = slot.getItem();
    if (item == undefined || !item.hasTag("minecraft:is_axe")) return; //Check if player has axe in hand, will only work if they have an axe
    player.setDynamicProperty('cutting', true);
    const itemdamage = item.getComponent("minecraft:durability").damage, itemmax = item.getComponent("minecraft:durability").maxDurability;
    const durability = item.getComponent("minecraft:enchantments").enchantments.hasEnchantment("unbreaking");
    if (itemmax - itemdamage <= 1) { player.setDynamicProperty('cutting', false); return; }
    var damage = await beginloop(event.dimension, itemdamage * (1 + durability), itemmax * (1 + durability), event.block.location); //Begin Loop
    damage = Math.ceil(damage * 1 / (1 + durability));
    const newItem = item.clone(); newItem.getComponent("minecraft:durability").damage = damage;
    if (damage >= itemmax) { player.onScreenDisplay.setActionBar("Axe at 0 durability!"); }
    slot.setItem(newItem);
    player.setDynamicProperty('cutting', false);

});

const blockCheckArrayx = [
    [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [-1, 1], [1, -1]
]

async function beginloop(dimension, itemdamage, itemmax, brokenBlockCoord) {
    return await xloop(dimension, [brokenBlockCoord], [brokenBlockCoord], itemdamage, itemmax)
}
async function xloop(dimension, toCheckArray, horizontalsArray, itemdamage, itemmax) {
    let foundArray = [];
    await toCheckArray.forEach(brokenBlockCoord => {
        blockCheckArrayx.forEach(blockCheck => {
            const newBlockLocation = {
                x: brokenBlockCoord.x + blockCheck[0],
                y: brokenBlockCoord.y,
                z: brokenBlockCoord.z + blockCheck[1]
            }
            if (foundArray.some(loc => (loc.x==newBlockLocation.x && loc.y==newBlockLocation.y && loc.z==newBlockLocation.z))) return;
            if (isLog(dimension.getBlock(newBlockLocation))) {
                foundArray.push(newBlockLocation);
            }
        });
    });
    for (let i = 0; i < foundArray.length; i++) {
        itemdamage += 1;
        const newBlock = dimension.getBlock(foundArray[i]);
        dimension.spawnItem(new ItemStack(newBlock.type.id), foundArray[i]);
        newBlock.setType(MinecraftBlockTypes.get("minecraft:air"));
        if (itemdamage == itemmax) return itemmax;
    }
    if (horizontalsArray.length == 0 && foundArray.length == 0) return itemdamage;
    else if (foundArray.length == 0) return ystep(dimension, horizontalsArray, itemdamage, itemmax);
    else return await xloop(dimension, foundArray, horizontalsArray.concat(foundArray), itemdamage, itemmax);
}
async function ystep(dimension, horizontalsArray, itemdamage, itemmax) {
    for (let i = 0; i < horizontalsArray.length; i++) {
        horizontalsArray[i].y += 1;
    }
    return await xloop(dimension, horizontalsArray, [], itemdamage, itemmax);
}
function isLog(block) {
    if (block === undefined) return false; 
    if (block.hasTag("log") || (block.type.id.includes("_log") && !block.type.id.includes("stripped_"))) return true;
    else return false;
}