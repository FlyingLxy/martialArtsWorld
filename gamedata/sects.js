/* 门派：入门加成、掌门名号。加派系改这里。 */

const SECTS = {
  shaolin:{name:'少林寺', desc:'外家之宗，横练金钟罩，根骨最厚。', bonus:{root:3}, master:'玄慈方丈'},
  wudang: {name:'武当派', desc:'内家之首，以柔克刚，内力绵长。', bonus:{mind:3}, master:'冲虚道长'},
  emei:   {name:'峨眉派', desc:'剑走轻灵，身法飘忽如烟。',       bonus:{agi:3},  master:'灭绝师太'},
  gaibang:{name:'丐帮',   desc:'天下第一大帮，掌法刚猛无俦。',   bonus:{str:3},  master:'洪长老'},
  huashan:{name:'华山派', desc:'气剑双修，样样均衡。', bonus:{str:1,root:1,mind:1,agi:1}, master:'岳掌门'},
};

/*#node*/ module.exports = { SECTS };
