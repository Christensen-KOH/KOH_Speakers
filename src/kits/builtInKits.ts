import { Kit } from './Kit';
import {
  FillBlankQuestion,
  ListeningQuestion,
  MultipleChoiceQuestion,
  QuestionKind,
} from './Question';

// Authoring helpers: the correct choice always comes first here; the modal
// shuffles choices when it shows them.

function mc(
  id: string,
  prompt: string,
  choices: string[],
  explanation?: string,
): MultipleChoiceQuestion {
  return {
    id,
    kind: QuestionKind.MultipleChoice,
    prompt,
    choices,
    correctIndex: 0,
    explanation,
  };
}

function listen(
  id: string,
  speak: string,
  prompt: string,
  choices: string[],
  explanation?: string,
): ListeningQuestion {
  return {
    id,
    kind: QuestionKind.Listening,
    speak,
    prompt,
    choices,
    correctIndex: 0,
    explanation,
  };
}

function fill(
  id: string,
  prompt: string,
  answers: string[],
  explanation?: string,
): FillBlankQuestion {
  return { id, kind: QuestionKind.FillBlank, prompt, answers, explanation };
}

const A1_ANIMALS: Kit = {
  id: 'builtin-a1-sight-words-animals',
  name: 'A1 Sight Words & Animals',
  level: 'A1',
  description: 'Everyday words, animals and the verb "to be".',
  builtIn: true,
  questions: [
    mc('a1-01', 'Which animal says "moo"?', ['cow', 'cat', 'duck', 'dog']),
    mc('a1-02', 'A baby dog is a ___.', ['puppy', 'kitten', 'calf', 'chick']),
    mc('a1-03', 'Which word is an animal?', ['horse', 'house', 'happy', 'hello']),
    mc('a1-04', 'What is the opposite of "big"?', ['small', 'tall', 'long', 'fast']),
    mc('a1-05', 'Which animal can fly?', ['bird', 'fish', 'cow', 'snake']),
    mc('a1-06', 'They ___ my friends.', ['are', 'is', 'am', 'be'], 'Use "are" with they, we and you.'),
    mc('a1-07', 'Which word means "not old"?', ['new', 'sad', 'cold', 'slow']),
    mc('a1-08', 'A fish lives in the ___.', ['water', 'tree', 'sky', 'desert']),
    listen('a1-09', 'elephant', 'Which word did you hear?', ['elephant', 'element', 'eleven', 'elegant']),
    listen('a1-10', 'rabbit', 'Which word did you hear?', ['rabbit', 'ribbon', 'robot', 'rubber']),
    listen('a1-11', 'The cat is under the table.', 'Where is the cat?', ['under the table', 'on the table', 'next to the table', 'behind the door']),
    listen('a1-12', 'giraffe', 'Which word did you hear?', ['giraffe', 'graph', 'gift', 'garage']),
    listen('a1-13', 'I have two brown dogs.', 'What did you hear?', ['two brown dogs', 'two brown ducks', 'ten brown dogs', 'two big dogs']),
    fill('a1-14', 'I ___ a student. (be)', ['am'], 'I am, you are, he/she/it is.'),
    fill('a1-15', 'Name the animal: it gives us milk and says "moo".', ['cow', 'a cow']),
    fill('a1-16', 'The plural of "mouse" is ___.', ['mice'], 'Mouse → mice is irregular.'),
    fill('a1-17', 'Look ___ the bird! It is beautiful.', ['at'], 'We say "look at" something.'),
    fill('a1-18', 'She ___ a red bike. (have)', ['has'], 'He/she/it has.'),
  ],
};

const A2_PAST_SIMPLE: Kit = {
  id: 'builtin-a2-past-simple-irregulars',
  name: 'A2 Past Simple Irregulars',
  level: 'A2',
  description: 'Common irregular verbs in the past simple.',
  builtIn: true,
  questions: [
    mc('a2-01', 'Yesterday I ___ to the park.', ['went', 'goed', 'go', 'gone'], 'go → went → gone'),
    mc('a2-02', 'She ___ a letter last week.', ['wrote', 'writed', 'written', 'write'], 'write → wrote → written'),
    mc('a2-03', 'We ___ pizza for dinner last night.', ['ate', 'eated', 'eat', 'eaten'], 'eat → ate → eaten'),
    mc('a2-04', 'What is the past simple of "buy"?', ['bought', 'buyed', 'brought', 'buyt'], 'buy → bought (bring → brought)'),
    mc('a2-05', 'They ___ a great film on Saturday.', ['saw', 'seed', 'seen', 'sawed'], 'see → saw → seen'),
    mc('a2-06', 'I ___ my keys this morning.', ['lost', 'losed', 'lose', 'lossed'], 'lose → lost'),
    mc('a2-07', 'Did you ___ the bus yesterday?', ['catch', 'caught', 'catched', 'catches'], 'After "did", use the base verb.'),
    mc('a2-08', 'The baby ___ all night.', ['slept', 'sleeped', 'sleept', 'sleeps'], 'sleep → slept'),
    listen('a2-09', 'taught', 'Which verb did you hear?', ['taught', 'thought', 'fought', 'bought']),
    listen('a2-10', 'I brought a cake to the party.', 'What did the speaker do?', ['brought a cake', 'bought a cake', 'baked a cake', 'broke a cake']),
    listen('a2-11', 'They began the lesson at nine.', 'What did you hear?', ['They began at nine.', 'They begin at nine.', 'They will begin at nine.', 'They are beginning at nine.']),
    listen('a2-12', 'thought', 'Which word did you hear?', ['thought', 'taught', 'though', 'through']),
    fill('a2-13', 'Past simple of "drink": ___', ['drank'], 'drink → drank → drunk'),
    fill('a2-14', 'Last summer we ___ in the sea. (swim)', ['swam'], 'swim → swam → swum'),
    fill('a2-15', 'He ___ a wallet on the street. (find)', ['found'], 'find → found'),
    fill('a2-16', 'I ___ him yesterday. (not / see)', ["didn't see", 'did not see'], 'Negative: did not + base verb.'),
    fill('a2-17', 'Past simple of "fly": ___', ['flew'], 'fly → flew → flown'),
    fill('a2-18', 'She ___ the window by accident. (break)', ['broke'], 'break → broke → broken'),
  ],
};

const B1_PHRASAL_VERBS: Kit = {
  id: 'builtin-b1-phrasal-verbs',
  name: 'B1 Phrasal Verbs',
  level: 'B1',
  description: 'Everyday phrasal verbs in context.',
  builtIn: true,
  questions: [
    mc('b1-01', 'Please ___ the lights when you leave.', ['turn off', 'turn up', 'take off', 'put up']),
    mc('b1-02', 'I need to ___ my little brother tonight.', ['look after', 'look up', 'look into', 'look out'], 'look after = take care of'),
    mc('b1-03', 'The plane will ___ in ten minutes.', ['take off', 'take up', 'take after', 'take over'], 'take off = leave the ground'),
    mc('b1-04', 'Can you ___ this word in the dictionary?', ['look up', 'look for', 'look over', 'look forward'], 'look up = search for information'),
    mc('b1-05', '"Give up" means…', ['stop trying', 'give a present', 'lift something', 'give back']),
    mc('b1-06', 'We ran ___ milk, so I went to the shop.', ['out of', 'into', 'over', 'away'], 'run out of = have none left'),
    mc('b1-07', 'She ___ her mother: they have the same smile.', ['takes after', 'takes on', 'takes in', 'takes off'], 'take after = look or act like a parent'),
    mc('b1-08', 'To "put off" a meeting means to…', ['postpone it', 'cancel it forever', 'start it', 'attend it']),
    listen('b1-09', "I'm really looking forward to the holidays.", 'How does the speaker feel?', ['excited about the holidays', 'worried about the holidays', 'bored of the holidays', 'unsure about the holidays']),
    listen('b1-10', 'Could you pick me up at six?', 'What does the speaker want?', ['a ride at six', 'help lifting a box', 'a phone call at six', 'to meet at the gym']),
    listen('b1-11', 'We set off early in the morning.', 'What does it mean?', ['They started the journey early.', 'They arrived early.', 'They went to bed early.', 'They cancelled the trip.']),
    listen('b1-12', 'He finally showed up at noon.', 'What happened at noon?', ['He arrived.', 'He left.', 'He called.', 'He woke up.']),
    fill('b1-13', 'I get ___ well with my neighbours.', ['on', 'along'], 'get on / get along = have a good relationship'),
    fill('b1-14', "Don't give ___! You can do it.", ['up']),
    fill('b1-15', 'Please fill ___ this form.', ['in', 'out']),
    fill('b1-16', 'We need to find ___ what happened.', ['out'], 'find out = discover information'),
    fill('b1-17', "Turn the music ___, I can't hear it.", ['up']),
    fill('b1-18', 'I came ___ an old photo while cleaning.', ['across'], 'come across = find by chance'),
  ],
};

const B2_IDIOMS_CONDITIONALS: Kit = {
  id: 'builtin-b2-idioms-conditionals',
  name: 'B2 Idioms & Conditionals',
  level: 'B2',
  description: 'Common idioms plus zero to third conditionals.',
  builtIn: true,
  questions: [
    mc('b2-01', '"It\'s a piece of cake" means…', ["it's very easy", "it's delicious", "it's a small problem", "it's a celebration"]),
    mc('b2-02', 'If I ___ rich, I would travel the world.', ['were', 'am', 'will be', 'have been'], 'Second conditional: if + past simple, would + verb.'),
    mc('b2-03', 'If she had studied, she ___ the exam.', ['would have passed', 'would pass', 'will pass', 'passed'], 'Third conditional: if + past perfect, would have + past participle.'),
    mc('b2-04', '"Break the ice" means…', ['start a conversation in an awkward situation', 'cause an accident', 'end a friendship', 'cool a drink']),
    mc('b2-05', 'If you heat ice, it ___.', ['melts', 'would melt', 'melted', 'will have melted'], 'Zero conditional for general truths: present + present.'),
    mc('b2-06', '"Once in a blue moon" means…', ['very rarely', 'at night', 'every month', 'when you are sad']),
    mc('b2-07', 'I wish I ___ more free time.', ['had', 'have', 'would have', 'having'], 'wish + past simple for present wishes.'),
    mc('b2-08', 'Unless you hurry, you ___ the train.', ['will miss', 'miss', 'would miss', 'missed'], 'unless = if not; first conditional.'),
    listen('b2-09', 'If I had known, I would have called you.', 'What happened?', ["The speaker didn't know, so didn't call.", 'The speaker knew and called.', 'The speaker will call later.', 'The speaker always calls.']),
    listen('b2-10', "Don't worry, it's not rocket science.", 'What does the speaker mean?', ["It isn't difficult.", "It's about space.", "It's dangerous.", "It's expensive."]),
    listen('b2-11', 'She let the cat out of the bag.', 'What did she do?', ['She revealed a secret.', 'She freed her pet.', 'She made a mistake at work.', 'She went shopping.']),
    listen('b2-12', "If it rains tomorrow, we'll stay home.", 'What will they do?', ['Stay home only if it rains.', 'Stay home whatever happens.', 'Go out in the rain.', 'They stayed home yesterday.']),
    fill('b2-13', "If I ___ you, I'd apologise. (be)", ['were', 'was'], '"If I were you" is the standard advice form.'),
    fill('b2-14', 'If we had left earlier, we ___ the bus. (not / miss)', ["wouldn't have missed", 'would not have missed']),
    fill('b2-15', 'Complete the idiom "hit the ___" (go to bed).', ['sack', 'hay']),
    fill('b2-16', 'Complete the idiom "cost an arm and a ___" (be very expensive).', ['leg']),
    fill('b2-17', 'If you ___ red and blue, you get purple. (mix)', ['mix'], 'Zero conditional: present simple in both parts.'),
    fill('b2-18', 'Complete the idiom "the ball is in your ___" (it\'s your decision).', ['court']),
  ],
};

export const BUILT_IN_KITS: Kit[] = [
  A1_ANIMALS,
  A2_PAST_SIMPLE,
  B1_PHRASAL_VERBS,
  B2_IDIOMS_CONDITIONALS,
];
