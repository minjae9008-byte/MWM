/**
 * 내장 단어 덱.
 *
 * 포맷: `영어|한국어|품사|태그,태그`
 * 품사 코드: n 명사 / v 동사 / a 형용사 / ad 부사 / prep 전치사 / phr 구
 * 태그는 오답(디코이) 선택 시 "헷갈리는 후보"를 고르는 데 쓰인다.
 */

const BASIC = `
apple|사과|n|food
bread|빵|n|food
water|물|n|food,nature
rice|쌀, 밥|n|food
meat|고기|n|food
vegetable|채소|n|food
house|집|n|place
room|방|n|place
door|문|n|object
window|창문|n|object
table|탁자|n|object
chair|의자|n|object
book|책|n|object,study
paper|종이|n|object
pencil|연필|n|object,study
bag|가방|n|object
clothes|옷|n|object
shoe|신발|n|object
friend|친구|n|people
family|가족|n|people
parent|부모|n|people
child|아이|n|people
neighbor|이웃|n|people
stranger|낯선 사람|n|people
teacher|선생님|n|people,study
student|학생|n|people,study
doctor|의사|n|people,health
nurse|간호사|n|people,health
farmer|농부|n|people
soldier|군인|n|people
school|학교|n|place,study
library|도서관|n|place,study
hospital|병원|n|place,health
market|시장|n|place,money
store|가게|n|place,money
office|사무실|n|place,work
station|역|n|place,travel
airport|공항|n|place,travel
restaurant|식당|n|place,food
bank|은행|n|place,money
city|도시|n|place
village|마을|n|place
country|나라|n|place
street|거리, 가로|n|place
bridge|다리, 교량|n|place
garden|정원|n|place,nature
forest|숲|n|nature
mountain|산|n|nature
river|강|n|nature
sea|바다|n|nature
island|섬|n|nature
field|들판|n|nature
sky|하늘|n|nature
sun|태양|n|nature
moon|달|n|nature
star|별|n|nature
cloud|구름|n|nature,weather
rain|비|n|nature,weather
snow|눈(날씨)|n|nature,weather
wind|바람|n|nature,weather
storm|폭풍|n|nature,weather
fire|불|n|nature
stone|돌|n|nature
sand|모래|n|nature
tree|나무|n|nature
flower|꽃|n|nature
grass|풀|n|nature
seed|씨앗|n|nature
animal|동물|n|animal
dog|개|n|animal
cat|고양이|n|animal
horse|말|n|animal
bird|새|n|animal
fish|물고기|n|animal
insect|곤충|n|animal
time|시간|n|time
year|해, 년|n|time
month|달, 월|n|time
week|주|n|time
day|날, 하루|n|time
hour|시간(1시간)|n|time
minute|분|n|time
morning|아침|n|time
afternoon|오후|n|time
evening|저녁|n|time
night|밤|n|time
today|오늘|n|time
tomorrow|내일|n|time
yesterday|어제|n|time
season|계절|n|time
money|돈|n|money
price|가격|n|money
cost|비용|n|money
change|거스름돈, 변화|n|money
salary|급여|n|money,work
work|일|n|work
job|직업|n|work
company|회사|n|work
meeting|회의|n|work
plan|계획|n|work
rule|규칙|n|abstract
reason|이유|n|abstract
idea|생각, 아이디어|n|abstract
question|질문|n|abstract,study
answer|대답|n|abstract,study
problem|문제|n|abstract
example|예시|n|abstract,study
story|이야기|n|abstract
news|소식, 뉴스|n|abstract
language|언어|n|study
word|단어|n|study
number|숫자|n|study
name|이름|n|abstract
life|삶, 인생|n|abstract
death|죽음|n|abstract
health|건강|n|health
body|몸|n|body,health
head|머리|n|body
face|얼굴|n|body
eye|눈(신체)|n|body
ear|귀|n|body
nose|코|n|body
mouth|입|n|body
tooth|이, 치아|n|body
hand|손|n|body
arm|팔|n|body
leg|다리(신체)|n|body
foot|발|n|body
heart|심장, 마음|n|body
blood|피|n|body
bone|뼈|n|body
skin|피부|n|body
voice|목소리|n|body
music|음악|n|art
song|노래|n|art
picture|그림, 사진|n|art
color|색깔|n|art
movie|영화|n|art
game|게임, 경기|n|art
sport|스포츠|n|art
car|자동차|n|travel
bus|버스|n|travel
train|기차|n|travel
ship|배|n|travel
airplane|비행기|n|travel
road|길, 도로|n|travel
ticket|표, 승차권|n|travel
eat|먹다|v|food
drink|마시다|v|food
cook|요리하다|v|food
sleep|자다|v|daily
wake|깨다|v|daily
wash|씻다|v|daily
wear|입다|v|daily
walk|걷다|v|move
run|달리다|v|move
jump|뛰어오르다|v|move
swim|수영하다|v|move
fly|날다|v|move
climb|오르다|v|move
fall|떨어지다|v|move
push|밀다|v|move
pull|당기다|v|move
carry|나르다|v|move
throw|던지다|v|move
catch|잡다|v|move
read|읽다|v|study
write|쓰다|v|study
learn|배우다|v|study
teach|가르치다|v|study
study|공부하다|v|study
count|세다|v|study
draw|그리다|v|art
sing|노래하다|v|art
play|놀다, 연주하다|v|art
speak|말하다, (언어를) 구사하다|v|talk
say|~라고 말하다|v|talk
tell|말해 주다|v|talk
ask|묻다|v|talk
reply|대답하다|v|talk
explain|설명하다|v|talk
describe|묘사하다|v|talk
listen|듣다|v|talk
hear|들리다|v|talk
see|보다|v|sense
watch|지켜보다|v|sense
look|보다, ~해 보이다|v|sense
feel|느끼다|v|sense
touch|만지다|v|sense
smell|냄새 맡다|v|sense
taste|맛보다|v|sense
think|생각하다|v|mind
know|알다|v|mind
understand|이해하다|v|mind
remember|기억하다|v|mind
forget|잊다|v|mind
believe|믿다|v|mind
guess|추측하다, 짐작하다|v|mind
decide|결정하다|v|mind
hope|바라다|v|mind
want|원하다|v|mind
need|필요하다|v|mind
like|좋아하다|v|mind
love|사랑하다|v|mind
hate|싫어하다|v|mind
worry|걱정하다|v|mind
buy|사다|v|money
sell|팔다|v|money
pay|지불하다|v|money
spend|쓰다, 보내다|v|money
save|모으다, 구하다|v|money
borrow|빌리다|v|money
lend|빌려주다|v|money
give|주다|v|action
take|가져가다|v|action
bring|가져오다|v|action
send|보내다|v|action
get|얻다|v|action
find|찾다|v|action
lose|잃다|v|action
keep|유지하다|v|action
make|만들다|v|action
build|짓다|v|action
break|부수다|v|action
fix|고치다|v|action
open|열다|v|action
close|닫다|v|action
cut|자르다|v|action
start|시작하다|v|action
finish|끝내다|v|action
stop|멈추다|v|action
continue|계속하다|v|action
try|시도하다|v|action
help|돕다|v|action
use|사용하다|v|action
choose|고르다|v|action
change|바꾸다|v|action
move|움직이다|v|action
wait|기다리다|v|action
meet|만나다|v|action
visit|방문하다|v|action
travel|여행하다|v|travel
arrive|도착하다|v|travel
leave|떠나다|v|travel
return|돌아오다|v|travel
enter|들어가다|v|travel
follow|따라가다|v|travel
win|이기다|v|action
lose|지다|v|action
fight|싸우다|v|action
protect|보호하다|v|action
grow|자라다|v|nature
big|큰|a|size
small|작은|a|size
large|커다란|a|size
tiny|아주 작은|a|size
long|긴|a|size
short|짧은|a|size
tall|키가 큰|a|size
wide|넓은|a|size
narrow|좁은|a|size
thick|두꺼운|a|size
thin|얇은|a|size
heavy|무거운|a|size
light|가벼운, 밝은|a|size
deep|깊은|a|size
high|높은|a|size
low|낮은|a|size
fast|빠른|a|speed
slow|느린|a|speed
early|이른|a|time
late|늦은|a|time
new|새로운|a|state
old|오래된, 나이 든|a|state
young|젊은|a|state
fresh|신선한|a|state
clean|깨끗한|a|state
dirty|더러운|a|state
dry|마른|a|state
wet|젖은|a|state
hot|뜨거운|a|state
cold|차가운|a|state
warm|따뜻한|a|state
cool|시원한|a|state
hard|단단한, 어려운|a|state
soft|부드러운|a|state
strong|강한|a|state
weak|약한|a|state
good|좋은|a|value
bad|나쁜|a|value
right|옳은, 오른쪽의|a|value
wrong|틀린|a|value
easy|쉬운|a|value
difficult|어려운|a|value
simple|단순한|a|value
important|중요한|a|value
useful|유용한|a|value
possible|가능한|a|value
free|자유로운, 무료의|a|value
cheap|값싼|a|money
expensive|비싼|a|money
rich|부유한|a|money
poor|가난한|a|money
happy|행복한|a|feel
sad|슬픈|a|feel
angry|화난|a|feel
afraid|두려워하는|a|feel
tired|피곤한|a|feel
hungry|배고픈|a|feel
thirsty|목마른|a|feel
bored|지루해하는|a|feel
excited|신이 난|a|feel
calm|차분한|a|feel
kind|친절한|a|feel
brave|용감한|a|feel
honest|정직한|a|feel
polite|예의 바른|a|feel
funny|웃긴|a|feel
quiet|조용한|a|state
loud|시끄러운|a|state
safe|안전한|a|state
dangerous|위험한|a|state
beautiful|아름다운|a|value
famous|유명한|a|value
similar|비슷한|a|value
different|다른|a|value
call|부르다, 전화하다|v|talk
become|~이 되다|v|action
seem|~처럼 보이다|v|sense
happen|일어나다, 발생하다|v|action
live|살다|v|daily
die|죽다|v|daily
stay|머무르다|v|daily
turn|돌다, 바꾸다|v|move
show|보여 주다|v|talk
hold|잡다, 쥐다|v|action
put|놓다|v|action
bring|데려오다|v|action
let|~하게 하다|v|action
allow|허락하다|v|action
offer|제안하다, 제공하다|v|action
provide|제공하다|v|action
include|포함하다|v|action
prepare|준비하다|v|action
improve|개선하다|v|change
increase|증가하다|v|change
decrease|감소하다|v|change
compare|비교하다|v|mind
connect|연결하다|v|action
separate|분리하다|v|action
repeat|반복하다|v|action
follow|따르다|v|move
lead|이끌다|v|action
join|합류하다|v|action
share|나누다, 공유하다|v|action
collect|모으다|v|action
clean|청소하다|v|daily
rest|쉬다|v|daily
hurry|서두르다|v|move
avoid|피하다|v|action
accept|받아들이다|v|mind
refuse|거절하다|v|mind
promise|약속하다|v|talk
agree|동의하다|v|talk
disagree|반대하다|v|talk
complain|불평하다|v|talk
apologize|사과하다|v|talk
thank|감사하다|v|talk
invite|초대하다|v|talk
introduce|소개하다|v|talk
discuss|논의하다|v|talk
decide|정하다|v|mind
notice|알아차리다|v|sense
recognize|알아보다|v|sense
imagine|상상하다|v|mind
realize|깨닫다|v|mind
suppose|~라고 가정하다|v|mind
mean|의미하다|v|talk
matter|중요하다|v|abstract
weather|날씨|n|weather,nature
temperature|온도|n|weather
season|철, 계절|n|time
holiday|휴일|n|time
weekend|주말|n|time
future|미래|n|time
past|과거|n|time
present|현재, 선물|n|time
moment|순간|n|time
age|나이|n|abstract
size|크기|n|abstract
shape|모양|n|abstract
weight|무게|n|abstract
distance|거리, 간격|n|abstract
speed|속도|n|abstract
amount|양|n|abstract
part|부분|n|abstract
piece|조각|n|abstract
half|절반|n|abstract
group|무리, 집단|n|people
team|팀|n|people
member|구성원|n|people
leader|지도자|n|people
owner|주인|n|people
guest|손님|n|people
customer|손님, 고객|n|people,money
worker|노동자|n|people,work
police|경찰|n|people
driver|운전사|n|people,travel
kitchen|부엌|n|place
bedroom|침실|n|place
bathroom|욕실|n|place
building|건물|n|place
floor|바닥, 층|n|place
wall|벽|n|place
roof|지붕|n|place
gate|문, 정문|n|place
park|공원|n|place
beach|해변|n|place,nature
hill|언덕|n|nature
valley|계곡|n|nature
desert|사막|n|nature
lake|호수|n|nature
weak|서투른, 약한|a|state
busy|바쁜|a|state
free|한가한|a|state
ready|준비된|a|state
sure|확신하는|a|mind
careful|조심스러운|a|feel
lazy|게으른|a|feel
smart|똑똑한|a|feel
foolish|어리석은|a|feel
lonely|외로운|a|feel
proud|자랑스러운|a|feel
nervous|긴장한|a|feel
comfortable|편안한|a|feel
serious|진지한, 심각한|a|feel
usual|평소의|a|time
common|흔한|a|value
special|특별한|a|value
perfect|완벽한|a|value
terrible|끔찍한|a|value
enough|충분한|a|value
whole|전체의|a|value
empty|비어 있는|a|state
full|가득 찬|a|state
sharp|날카로운|a|state
smooth|매끄러운|a|state
`;

const ACADEMIC = `
abandon|버리다, 포기하다|v|core
ability|능력|n|core
absorb|흡수하다|v|science
abstract|추상적인|a|thought
accompany|동행하다|v|core
accomplish|성취하다|v|core
accumulate|축적하다|v|core
accurate|정확한|a|quality
acknowledge|인정하다|v|thought
acquire|습득하다|v|core
adapt|적응하다|v|change
adequate|(필요를 채울 만큼) 충분한|a|quality
adjust|조정하다|v|change
admire|존경하다|v|emotion
adopt|채택하다|v|core
advocate|옹호하다|v|argue
aesthetic|미적인|a|art
affect|영향을 미치다|v|cause
aggressive|공격적인|a|emotion
allocate|배분하다|v|core
alter|바꾸다|v|change
ambiguous|모호한, 중의적인|a|quality
ambitious|야심 찬|a|emotion
analyze|분석하다|v|thought
ancient|고대의|a|time
anticipate|예상하다|v|thought
apparent|겉보기의, 명백한|a|quality
appreciate|감사하다, 감상하다|v|emotion
approach|접근하다|v|core
appropriate|(상황에) 알맞은|a|quality
approve|승인하다, 찬성하다|v|core
arbitrary|임의의|a|quality
arise|발생하다|v|cause
articulate|분명히 말하다|v|argue
assemble|모으다, 조립하다|v|core
assert|주장하다|v|argue
assess|(가치·정도를) 가늠하다|v|thought
assign|배정하다|v|core
assume|가정하다|v|thought
assure|~에게 장담하다|v|argue
attain|달성하다|v|core
attribute|~의 탓으로 돌리다|v|cause
authentic|진품인, 정통의|a|quality
autonomy|자율성|n|society
aware|알고 있는|a|thought
barrier|장벽|n|society
bias|편견|n|thought
capable|~할 수 있는|a|core
capacity|수용력, 능력|n|core
cease|중단하다|v|change
circumstance|상황|n|society
cite|인용하다|v|argue
coherent|일관성 있는|a|quality
coincide|일치하다|v|quality
collapse|붕괴하다|v|change
commence|시작되다, 개시하다|v|change
compensate|보상하다|v|society
compel|강요하다|v|cause
competent|유능한|a|quality
comply|따르다, 준수하다|v|society
comprehend|충분히 이해하다, 파악하다|v|thought
comprise|~으로 이루어지다|v|core
conceal|숨기다|v|core
conceive|생각해 내다|v|thought
concentrate|집중하다|v|thought
conclude|결론짓다|v|argue
confine|제한하다|v|core
conform|순응하다|v|society
confront|직면하다|v|core
consensus|합의|n|society
consent|동의|n|society
consequence|결과, 여파|n|cause
conserve|아껴 쓰다, 보전하다|v|science
considerable|상당한, 꽤 큰|a|quality
consist|구성되다|v|core
constant|일정한|a|quality
constitute|~을 구성하다|v|core
constrain|제약하다|v|core
consume|소비하다|v|society
contemporary|동시대의|a|time
contradict|모순되다|v|argue
contribute|기여하다|v|cause
controversy|논쟁|n|argue
convey|전달하다, 실어 나르다|v|argue
convince|납득시키다|v|argue
cooperate|협력하다|v|society
correspond|일치하다, 서신을 주고받다|v|quality
credible|믿을 만한|a|quality
crucial|결정적인|a|quality
cultivate|경작하다, 기르다|v|science
curiosity|호기심|n|emotion
decline|감소하다, 거절하다|v|change
dedicate|헌신하다|v|emotion
deduce|(논리로) 추론하다|v|thought
deficiency|결핍|n|quality
definite|명확한|a|quality
deliberate|의도적인|a|thought
demonstrate|증명하다, 시위하다|v|argue
denote|나타내다, 의미하다|v|argue
deny|부인하다|v|argue
deprive|박탈하다|v|society
derive|유래하다, 얻어내다|v|cause
descend|내려가다|v|change
deteriorate|악화되다|v|change
determine|결정짓다, 알아내다|v|thought
deviate|벗어나다|v|change
devote|바치다|v|emotion
diminish|줄어들다, 약해지다|v|change
discard|버리다|v|core
discipline|규율, 학문 분야|n|society
discourage|낙담시키다|v|emotion
distinguish|구별하다|v|thought
distort|왜곡하다|v|change
distribute|분배하다|v|society
diverse|다양한|a|quality
dominate|지배하다|v|society
drastic|급격한|a|quality
dwell|살다, 머물다|v|society
eliminate|제거하다|v|core
embrace|포용하다|v|emotion
emerge|나타나다|v|change
emphasize|강조하다|v|argue
empirical|경험적인|a|science
enhance|향상시키다|v|change
enormous|거대한|a|quality
ensure|반드시 ~하게 하다|v|core
entail|수반하다|v|cause
equivalent|동등한|a|quality
essential|필수적인|a|quality
establish|설립하다|v|society
estimate|추정하다|v|thought
evaluate|평가하다|v|thought
evident|분명한, 뚜렷한|a|quality
evolve|진화하다|v|science
exaggerate|과장하다|v|argue
exceed|초과하다|v|quality
exclude|제외하다|v|core
exhibit|전시하다, 드러내다|v|art
expand|확장하다|v|change
explicit|명시적인|a|quality
exploit|이용하다, 착취하다|v|society
extract|추출하다|v|science
facilitate|촉진하다|v|cause
feasible|실현 가능한|a|quality
fluctuate|변동하다|v|change
foster|촉진하다, 양육하다|v|cause
fundamental|근본적인|a|quality
generate|발생시키다|v|cause
genuine|진심 어린, 진짜의|a|quality
grasp|파악하다, 움켜쥐다|v|thought
hesitate|망설이다|v|emotion
hostile|적대적인|a|emotion
hypothesis|가설|n|science
identical|동일한|a|quality
ignorant|무지한|a|thought
illustrate|예시하다, 삽화를 넣다|v|argue
immense|막대한|a|quality
implement|실행하다|v|core
implication|함의, 영향|n|argue
impose|부과하다|v|society
inclined|~하는 경향이 있는|a|thought
incentive|유인, 동기|n|society
indicate|가리키다, 시사하다|v|argue
indifferent|무관심한|a|emotion
inevitable|불가피한|a|quality
infer|(단서로) 추론하다|v|thought
inherent|내재된|a|quality
inhibit|억제하다, 방해하다|v|cause
initiate|착수하다|v|change
innate|타고난|a|science
innovative|혁신적인|a|quality
insight|통찰|n|thought
integrate|통합하다|v|core
intense|강렬한|a|quality
interpret|해석하다|v|thought
intervene|개입하다|v|society
intricate|복잡한|a|quality
intrinsic|본질적인|a|quality
intuition|직관|n|thought
isolate|고립시키다|v|society
justify|정당화하다|v|argue
legitimate|정당한, 합법적인|a|society
manipulate|조작하다|v|society
mediate|중재하다|v|society
mere|단지 ~에 불과한|a|quality
minimize|최소화하다|v|change
modify|수정하다|v|change
motivate|동기를 부여하다|v|emotion
mutual|상호의|a|society
negligible|무시할 만한|a|quality
notion|개념|n|thought
novel|참신한|a|quality
obscure|잘 알려지지 않은, 불분명한|a|quality
obstacle|장애물|n|society
obtain|얻어 내다, 입수하다|v|core
optimal|최적의|a|quality
outcome|결과, 성과|n|cause
overcome|극복하다|v|core
paradigm|패러다임, 전형|n|thought
perceive|인지하다|v|thought
persist|끈질기게 계속하다|v|change
perspective|관점|n|thought
persuade|설득하다|v|argue
phenomenon|현상|n|science
plausible|그럴듯한|a|quality
precise|정밀한|a|quality
predominant|지배적인|a|quality
preserve|보존하다, 보호하다|v|science
prevail|만연하다, 우세하다|v|society
prior|이전의|a|time
profound|심오한|a|thought
prohibit|금지하다|v|society
prominent|저명한, 두드러진|a|quality
prompt|촉발하다|v|cause
propose|제안하다|v|argue
pursue|추구하다, 뒤쫓다|v|core
radical|급진적인|a|society
reckless|무모한|a|emotion
reconcile|화해시키다, 조화시키다|v|society
refine|정제하다, 다듬다|v|change
refute|반박하다|v|argue
regard|여기다|v|thought
reinforce|강화하다|v|cause
reject|거부하다|v|argue
relevant|관련 있는|a|quality
reluctant|꺼리는|a|emotion
render|~하게 만들다|v|cause
represent|대표하다, 나타내다|v|argue
resemble|닮다|v|quality
resent|분개하다|v|emotion
reside|거주하다|v|society
resolve|해결하다, 결심하다|v|core
restore|복원하다|v|change
restrain|제지하다, 자제하다|v|core
retain|보유하다, 간직하다|v|core
retrieve|되찾다, 인출하다|v|thought
reveal|드러내다|v|argue
rigid|경직된|a|quality
scarce|부족한|a|quality
scrutiny|정밀 조사|n|thought
seek|찾다, 구하다|v|core
severe|심각한|a|quality
significant|의미 있는, 중대한|a|quality
simultaneous|동시의|a|time
skeptical|회의적인|a|thought
speculate|추정하다, 투기하다|v|thought
spontaneous|자발적인|a|emotion
stable|안정적인|a|quality
stimulate|자극하다|v|cause
subjective|주관적인|a|thought
subsequent|그 다음의|a|time
substantial|상당한, 실질적인|a|quality
subtle|미묘한|a|quality
sufficient|(필요를 채우기에) 충분한|a|quality
superficial|피상적인|a|thought
suppress|억압하다|v|society
surpass|능가하다|v|quality
sustain|지탱하다, 유지하다|v|change
tempt|유혹하다|v|emotion
tendency|경향|n|quality
theoretical|이론적인|a|science
thorough|철저한|a|quality
thrive|번창하다|v|change
tolerate|참다, 용인하다|v|emotion
transform|변형시키다|v|change
transmit|전송하다, 전염시키다|v|science
undergo|겪다|v|change
undermine|약화시키다|v|cause
uniform|균일한|a|quality
utilize|활용하다|v|core
valid|타당한|a|quality
vanish|사라지다|v|change
vary|다양하다|v|quality
verify|검증하다|v|science
vital|매우 중요한, 생명의|a|quality
vulnerable|취약한|a|quality
widespread|널리 퍼진|a|society
yield|산출하다, 양보하다|v|cause
`;

const BUSINESS = `
account|계좌, 거래처|n|finance
accountant|회계사|n|people
acquisition|인수|n|corporate
agenda|안건|n|meeting
allocate|할당하다|v|manage
applicant|지원자|n|hr
appoint|임명하다|v|hr
appraisal|평가|n|hr
asset|자산|n|finance
audit|회계 감사|n|finance
authorize|승인하다|v|manage
bid|입찰하다|v|trade
branch|지점|n|corporate
budget|예산|n|finance
candidate|후보자|n|hr
capital|자본|n|finance
client|고객|n|trade
colleague|동료|n|hr
commission|수수료|n|finance
commodity|상품, 원자재|n|trade
competitor|경쟁사|n|trade
compliance|준수|n|legal
confidential|기밀의|a|legal
consignment|위탁 화물|n|logistics
contract|계약|n|legal
corporate|기업의|a|corporate
credential|자격 증명|n|hr
creditor|채권자|n|finance
deadline|마감일|n|manage
deduct|공제하다|v|finance
deficit|적자|n|finance
delegate|위임하다|v|manage
department|부서|n|corporate
deposit|예치금|n|finance
depreciation|감가상각|n|finance
disclose|공개하다|v|legal
dispatch|발송하다|v|logistics
dividend|배당금|n|finance
draft|초안|n|manage
endorse|지지하다, 배서하다|v|trade
enterprise|기업|n|corporate
equity|지분, 자기 자본|n|finance
estimate|견적|n|finance
executive|임원|n|hr
expenditure|지출|n|finance
expertise|전문 지식|n|hr
facility|시설|n|logistics
feasible|실행 가능한|a|manage
fiscal|회계의, 재정의|a|finance
forecast|예측|n|manage
freight|화물|n|logistics
fulfill|이행하다|v|manage
headquarters|본사|n|corporate
incentive|성과급|n|hr
incur|초래하다|v|finance
inquiry|문의|n|trade
inspect|점검하다|v|logistics
installment|할부금|n|finance
insurance|보험|n|finance
invoice|청구서|n|trade
itinerary|여행 일정표|n|travel
launch|출시하다|v|trade
lease|임대하다|v|legal
liability|부채, 책임|n|finance
logistics|물류|n|logistics
maintenance|유지 보수|n|logistics
mandatory|의무적인|a|legal
merchandise|상품|n|trade
merge|합병하다|v|corporate
negotiate|협상하다|v|trade
obligation|의무|n|legal
outsource|외주를 주다|v|manage
overhead|간접비|n|finance
patent|특허|n|legal
payroll|급여 대장|n|hr
personnel|인사, 직원|n|hr
portfolio|포트폴리오|n|finance
premises|부지, 건물|n|logistics
procurement|조달|n|logistics
proficient|능숙한|a|hr
profit|이익|n|finance
projection|예상치|n|finance
promotion|승진, 홍보|n|hr
prospect|전망, 잠재 고객|n|trade
quarterly|분기별의|a|finance
quota|할당량|n|manage
receipt|영수증|n|trade
recruit|채용하다|v|hr
redeem|상환하다, 교환하다|v|finance
refund|환불|n|trade
reimburse|상환하다|v|finance
renewal|갱신|n|legal
reputation|평판|n|corporate
retail|소매|n|trade
retention|유지, 보유|n|hr
revenue|수익|n|finance
scheme|계획, 제도|n|manage
shareholder|주주|n|corporate
shipment|배송, 선적|n|logistics
solicit|요청하다|v|trade
stakeholder|이해관계자|n|corporate
subsidiary|자회사|n|corporate
subsidy|보조금|n|finance
supervisor|상사, 관리자|n|hr
supplier|공급업체|n|logistics
surplus|잉여, 흑자|n|finance
tariff|관세|n|trade
tenant|세입자|n|legal
tentative|잠정적인|a|manage
transaction|거래|n|finance
turnover|매출액, 이직률|n|corporate
venue|장소|n|meeting
verify|확인하다, 대조하다|v|manage
waive|포기하다, 면제하다|v|legal
warehouse|창고|n|logistics
warranty|품질 보증|n|legal
wholesale|도매|n|trade
withdraw|인출하다, 철회하다|v|finance
workforce|노동력|n|hr
`;


/**
 * 예문.
 *
 * 뜻만 외운 단어는 정작 문장에서 못 알아본다.
 * 특히 추상어는 "무엇과 함께 쓰이는가"를 봐야 뜻이 잡히므로,
 * 헷갈리기 쉬운 학술 어휘부터 붙였다.
 *
 * 포맷: `영단어|예문|예문 번역`
 * 내 단어장에도 5·6번째 칸으로 넣을 수 있다.
 */
const EXAMPLES = `
abandon|They had to abandon the plan when funding ran out.|자금이 떨어지자 그들은 계획을 포기해야 했다.
abstract|Freedom is an abstract idea that is hard to measure.|자유는 측정하기 어려운 추상적인 개념이다.
accumulate|Dust had accumulated on the shelves over the years.|수년에 걸쳐 선반에 먼지가 쌓여 있었다.
acknowledge|She acknowledged that her first answer was wrong.|그녀는 자신의 첫 답이 틀렸음을 인정했다.
acquire|Children acquire language without formal lessons.|아이들은 정식 수업 없이도 언어를 습득한다.
adapt|Animals adapt to changes in their environment.|동물은 환경 변화에 적응한다.
adequate|The room is adequate for six people, but no more.|그 방은 여섯 명에게는 적절하지만 그 이상은 무리다.
adopt|The company adopted a four-day work week.|그 회사는 주 4일제를 채택했다.
advocate|He advocates stricter safety rules.|그는 더 엄격한 안전 규정을 옹호한다.
aesthetic|The building was chosen for aesthetic rather than practical reasons.|그 건물은 실용성보다 미적인 이유로 선택되었다.
ambiguous|The contract was ambiguous about who pays for repairs.|그 계약서는 수리비를 누가 내는지 모호했다.
anticipate|We did not anticipate such a large crowd.|우리는 이렇게 많은 인파를 예상하지 못했다.
arbitrary|The deadline felt arbitrary, with no reason behind it.|그 마감일은 아무 근거 없이 임의로 정해진 것처럼 느껴졌다.
articulate|She articulated her concerns clearly at the meeting.|그녀는 회의에서 우려를 분명히 말했다.
assert|The author asserts that the data has been misread.|저자는 그 자료가 잘못 읽혔다고 주장한다.
assess|Teachers assess progress through regular tests.|교사들은 정기 시험으로 학습 진도를 평가한다.
assume|Do not assume the reader knows the background.|독자가 배경을 안다고 가정하지 마라.
attribute|She attributes her success to steady practice.|그녀는 자신의 성공을 꾸준한 연습 덕으로 돌린다.
authentic|Experts confirmed the painting was authentic.|전문가들은 그 그림이 진품임을 확인했다.
autonomy|The region was granted greater autonomy.|그 지역은 더 큰 자율권을 얻었다.
bias|The study was criticized for bias in sample selection.|그 연구는 표본 선정의 편향 때문에 비판받았다.
capacity|The hall has a capacity of two thousand.|그 홀의 수용 인원은 2천 명이다.
cease|The noise ceased as suddenly as it had started.|그 소음은 시작될 때처럼 갑자기 멈췄다.
coherent|His argument was coherent from start to finish.|그의 논증은 처음부터 끝까지 일관성이 있었다.
coincide|Her visit coincided with the festival.|그녀의 방문은 축제와 시기가 겹쳤다.
collapse|The roof collapsed under the weight of the snow.|눈의 무게로 지붕이 무너졌다.
compensate|The airline compensated passengers for the delay.|항공사는 지연에 대해 승객들에게 보상했다.
compel|Nothing can compel him to change his mind.|무엇도 그의 마음을 바꾸도록 강요할 수 없다.
comply|All drivers must comply with the speed limit.|모든 운전자는 제한 속도를 지켜야 한다.
comprise|The committee comprises twelve members.|그 위원회는 12명으로 구성된다.
conceal|He could not conceal his disappointment.|그는 실망을 숨기지 못했다.
confine|The illness confined her to bed for a week.|그 병 때문에 그녀는 일주일간 침대에 갇혀 지냈다.
conform|New buildings must conform to safety codes.|새 건물은 안전 기준을 따라야 한다.
confront|Sooner or later we must confront the problem.|조만간 우리는 그 문제에 직면해야 한다.
consensus|The group reached a consensus after long debate.|긴 토론 끝에 그 모임은 합의에 이르렀다.
consequence|Every choice has consequences.|모든 선택에는 결과가 따른다.
considerable|The project required considerable effort.|그 프로젝트에는 상당한 노력이 필요했다.
constitute|These three rules constitute the entire policy.|이 세 규칙이 정책 전부를 구성한다.
constrain|A small budget constrained what we could build.|적은 예산이 우리가 만들 수 있는 것을 제약했다.
contemporary|The museum shows contemporary Korean art.|그 미술관은 동시대 한국 미술을 전시한다.
contradict|His later statement contradicted the first one.|그의 나중 발언은 처음 발언과 모순되었다.
controversy|The decision caused considerable controversy.|그 결정은 상당한 논쟁을 일으켰다.
convey|Photographs cannot convey how cold it was.|사진으로는 얼마나 추웠는지 전달할 수 없다.
credible|We need a credible explanation for the gap.|그 공백에 대한 믿을 만한 설명이 필요하다.
crucial|The next month is crucial to the outcome.|다음 한 달이 결과에 결정적이다.
deliberate|The omission was deliberate, not a mistake.|그 누락은 실수가 아니라 의도적이었다.
demonstrate|The experiment demonstrates the principle clearly.|그 실험은 원리를 분명히 증명한다.
deprive|Poor sleep deprives the brain of recovery time.|수면 부족은 뇌에서 회복 시간을 빼앗는다.
derive|The word derives from Latin.|그 단어는 라틴어에서 유래한다.
deteriorate|Her handwriting deteriorated as she wrote faster.|빨리 쓸수록 그녀의 글씨는 나빠졌다.
deviate|The results deviate slightly from the prediction.|결과는 예측에서 약간 벗어난다.
diminish|Interest diminished after the first week.|첫 주가 지나자 관심이 줄어들었다.
discipline|Economics is a discipline with its own methods.|경제학은 고유한 방법론을 가진 학문 분야다.
distinguish|It is hard to distinguish the twins by sight.|그 쌍둥이를 눈으로 구별하기는 어렵다.
distort|Fear can distort how we remember events.|두려움은 우리가 사건을 기억하는 방식을 왜곡할 수 있다.
diverse|The city has a diverse population.|그 도시는 인구 구성이 다양하다.
dominate|One company dominates the entire market.|한 회사가 시장 전체를 지배한다.
drastic|Drastic cuts were needed to balance the budget.|예산을 맞추려면 급격한 삭감이 필요했다.
eliminate|The new filter eliminates most of the noise.|새 필터는 소음의 대부분을 제거한다.
emerge|A clear pattern emerged from the data.|자료에서 뚜렷한 양상이 나타났다.
empirical|The claim lacks empirical support.|그 주장은 경험적 근거가 부족하다.
enhance|Good lighting enhances the color of the room.|좋은 조명은 방의 색감을 향상시킨다.
entail|Running a shop entails long hours.|가게를 운영하는 일은 긴 노동 시간을 수반한다.
equivalent|One mile is roughly equivalent to 1.6 kilometers.|1마일은 대략 1.6킬로미터에 해당한다.
evident|It was evident that she had not slept.|그녀가 잠을 못 잤다는 것이 명백했다.
evolve|The plan evolved over several months.|그 계획은 몇 달에 걸쳐 발전해 갔다.
exaggerate|He tends to exaggerate the size of the crowd.|그는 인파의 규모를 과장하는 경향이 있다.
exceed|Costs exceeded the original estimate.|비용이 최초 추정치를 초과했다.
explicit|The instructions were explicit about the order.|그 지시는 순서에 대해 명시적이었다.
exploit|The company was accused of exploiting its workers.|그 회사는 노동자를 착취했다는 비난을 받았다.
facilitate|A shared language facilitates cooperation.|공통 언어는 협력을 촉진한다.
fluctuate|Prices fluctuate with the seasons.|가격은 계절에 따라 변동한다.
foster|Small classes foster closer discussion.|소규모 수업은 더 긴밀한 토론을 촉진한다.
fundamental|Trust is fundamental to any partnership.|신뢰는 어떤 동반 관계에도 근본적이다.
genuine|Her surprise seemed genuine.|그녀의 놀라움은 진짜처럼 보였다.
grasp|It took him a while to grasp the idea.|그가 그 개념을 파악하는 데 시간이 좀 걸렸다.
hesitate|Do not hesitate to ask for help.|도움을 청하기를 망설이지 마라.
hypothesis|The experiment tests a simple hypothesis.|그 실험은 단순한 가설을 검증한다.
illustrate|This case illustrates the danger of guessing.|이 사례는 추측의 위험을 잘 보여 준다.
implement|The school implemented the new schedule in March.|그 학교는 3월에 새 일정을 실행했다.
implication|The findings have implications for policy.|그 연구 결과는 정책에 시사하는 바가 있다.
impose|The city imposed a limit on car use.|시는 차량 이용에 제한을 부과했다.
inevitable|Some delay was inevitable in such a large project.|이렇게 큰 사업에서 어느 정도 지연은 불가피했다.
infer|From her tone we inferred that she disagreed.|그녀의 말투로 보아 우리는 그녀가 반대한다고 추론했다.
inherent|There are risks inherent in any investment.|어떤 투자에도 내재된 위험이 있다.
inhibit|Cold weather inhibits the growth of the plant.|추운 날씨는 그 식물의 성장을 억제한다.
innate|A sense of rhythm seems partly innate.|리듬 감각은 부분적으로 타고나는 것으로 보인다.
insight|The book offers real insight into the period.|그 책은 그 시대에 대한 진짜 통찰을 준다.
integrate|The two systems were integrated last year.|두 시스템은 작년에 통합되었다.
interpret|Two readers may interpret the same poem differently.|두 독자가 같은 시를 다르게 해석할 수 있다.
intervene|The teacher intervened before the argument grew.|다툼이 커지기 전에 교사가 개입했다.
intrinsic|The work has intrinsic value beyond its price.|그 작품은 가격을 넘어서는 본질적 가치가 있다.
justify|Nothing can justify such a delay.|그런 지연은 무엇으로도 정당화될 수 없다.
legitimate|She has a legitimate reason to complain.|그녀에게는 불평할 정당한 이유가 있다.
manipulate|The images had been manipulated before publication.|그 사진들은 공개 전에 조작되어 있었다.
mere|A mere five minutes changed everything.|단 5분이 모든 것을 바꿔 놓았다.
modify|We modified the design after the first test.|첫 시험 후 우리는 설계를 수정했다.
mutual|The agreement was to their mutual benefit.|그 합의는 양측에 상호 이익이 되었다.
negligible|The difference in cost was negligible.|비용 차이는 무시할 만했다.
notion|He rejected the notion that talent is fixed.|그는 재능이 고정되어 있다는 개념을 거부했다.
novel|The team proposed a novel approach.|그 팀은 참신한 접근법을 제안했다.
obscure|The origin of the custom remains obscure.|그 관습의 기원은 여전히 모호하다.
optimal|Early morning is the optimal time to study.|이른 아침이 공부하기에 최적의 시간이다.
paradigm|The discovery changed the dominant paradigm.|그 발견은 지배적인 패러다임을 바꿔 놓았다.
perceive|We perceive colors differently in dim light.|어두운 빛에서는 색이 다르게 인지된다.
persist|The symptoms persisted for several weeks.|증상이 몇 주 동안 지속되었다.
phenomenon|Sleep is a phenomenon we still do not fully explain.|잠은 우리가 아직 완전히 설명하지 못하는 현상이다.
plausible|That sounds plausible, but we need proof.|그럴듯하게 들리지만 증거가 필요하다.
predominant|English is the predominant language in the field.|영어가 그 분야의 지배적인 언어다.
prevail|Old habits prevailed despite the new rules.|새 규칙에도 불구하고 옛 습관이 우세했다.
profound|The loss had a profound effect on him.|그 상실은 그에게 깊은 영향을 미쳤다.
prominent|She is a prominent figure in the field.|그녀는 그 분야의 저명한 인물이다.
prompt|The warning prompted a quick response.|그 경고는 빠른 대응을 촉발했다.
pursue|He decided to pursue a career in medicine.|그는 의학 분야의 경력을 추구하기로 했다.
refute|New evidence refuted the earlier claim.|새 증거가 이전 주장을 반박했다.
reinforce|The results reinforce what we already suspected.|그 결과는 우리가 이미 의심하던 바를 강화한다.
relevant|Only relevant details belong in a summary.|요약에는 관련 있는 내용만 들어가야 한다.
reluctant|She was reluctant to speak first.|그녀는 먼저 말하기를 꺼렸다.
resemble|The copy closely resembles the original.|그 사본은 원본과 매우 닮았다.
retain|Most students retain little without review.|대부분의 학생은 복습 없이는 거의 기억하지 못한다.
retrieve|It takes effort to retrieve a word you rarely use.|거의 쓰지 않는 단어를 인출하는 데는 노력이 든다.
rigid|The schedule was too rigid to allow changes.|그 일정은 변경을 허용하기에는 너무 경직되어 있었다.
scarce|Water became scarce during the long summer.|긴 여름 동안 물이 부족해졌다.
skeptical|Scientists remained skeptical of the claim.|과학자들은 그 주장에 회의적이었다.
speculate|We can only speculate about the cause.|우리는 원인에 대해 추측할 수밖에 없다.
subjective|Taste in music is largely subjective.|음악 취향은 대체로 주관적이다.
subsequent|Subsequent tests confirmed the first result.|이후의 시험들이 첫 결과를 확인해 주었다.
subtle|There is a subtle difference between the two words.|그 두 단어 사이에는 미묘한 차이가 있다.
sufficient|One example is not sufficient proof.|한 가지 예는 충분한 증거가 아니다.
superficial|His knowledge of the topic was superficial.|그 주제에 대한 그의 지식은 피상적이었다.
suppress|The government tried to suppress the report.|정부는 그 보고서를 억압하려 했다.
sustain|The pace was too fast to sustain.|그 속도는 지속하기에 너무 빨랐다.
tendency|There is a tendency to overestimate what we know.|우리가 아는 것을 과대평가하는 경향이 있다.
thorough|The inspection was thorough and took all day.|그 점검은 철저해서 온종일 걸렸다.
thrive|The plants thrive in cool, damp soil.|그 식물들은 서늘하고 축축한 흙에서 잘 자란다.
tolerate|The engine cannot tolerate that much heat.|그 엔진은 그 정도 열을 견디지 못한다.
undermine|Constant delays undermined our confidence.|끊임없는 지연이 우리의 신뢰를 약화시켰다.
valid|The argument is valid only under those conditions.|그 논증은 그 조건 아래에서만 타당하다.
vanish|The fog vanished as the sun rose.|해가 뜨자 안개가 사라졌다.
verify|Please verify the figures before sending.|보내기 전에 수치를 검증해 주세요.
vulnerable|Young trees are vulnerable to frost.|어린 나무는 서리에 취약하다.
widespread|The belief was widespread but mistaken.|그 믿음은 널리 퍼져 있었지만 잘못된 것이었다.
yield|The experiment yielded surprising results.|그 실험은 놀라운 결과를 산출했다.
`;

/** `영단어|예문|번역` → Map */
function parseExamples(text) {
  const map = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const [en, ex, exKo] = line.split('|').map((x) => (x || '').trim());
    if (en && ex) map.set(en.toLowerCase(), { ex, exKo: exKo || '' });
  }
  return map;
}

const EXAMPLE_MAP = parseExamples(EXAMPLES);

/** 파이프 구분 텍스트 → 단어 객체 배열 */
export function parseWordList(text, deckId) {
  const out = [];
  const seen = new Set();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [en, ko, pos = '', tags = '', ex = '', exKo = ''] = line.split('|').map((s) => (s || '').trim());
    if (!en || !ko) continue;
    // 같은 덱 안에서 철자가 겹치면(break/change 등 다의어) 뜻을 합쳐 id 충돌을 막는다
    const id = `${deckId}:${en.toLowerCase()}`;
    if (seen.has(id)) {
      const prev = out.find((w) => w.id === id);
      if (prev && !prev.ko.includes(ko)) prev.ko += `, ${ko}`;
      continue;
    }
    seen.add(id);
    const builtin = EXAMPLE_MAP.get(en.toLowerCase());
    out.push({
      id,
      en,
      ko,
      pos,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      deck: deckId,
      ex: ex || builtin?.ex || '',
      exKo: exKo || builtin?.exKo || '',
    });
  }
  return out;
}

export const BUILTIN_DECKS = [
  {
    id: 'basic',
    name: '기초 필수',
    desc: '일상에서 가장 자주 쓰이는 기본 어휘. 처음 시작한다면 여기부터.',
    level: 1,
    raw: BASIC,
  },
  {
    id: 'academic',
    name: '수능·학술 핵심',
    desc: '수능·모의고사·학술 지문의 고빈도 추상 어휘.',
    level: 2,
    raw: ACADEMIC,
  },
  {
    id: 'business',
    name: '비즈니스 · TOEIC',
    desc: '사무·무역·회계 문맥에서 반복 출제되는 실무 어휘.',
    level: 3,
    raw: BUSINESS,
  },
].map((d) => {
  const words = parseWordList(d.raw, d.id);
  return { id: d.id, name: d.name, desc: d.desc, level: d.level, words, builtin: true };
});
