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
street|거리|n|place
bridge|다리|n|place
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
snow|눈|n|nature,weather
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
eye|눈|n|body
ear|귀|n|body
nose|코|n|body
mouth|입|n|body
tooth|이, 치아|n|body
hand|손|n|body
arm|팔|n|body
leg|다리|n|body
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
speak|말하다|v|talk
say|말하다|v|talk
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
guess|추측하다|v|mind
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
adequate|적절한|a|quality
adjust|조정하다|v|change
admire|존경하다|v|emotion
adopt|채택하다|v|core
advocate|옹호하다|v|argue
aesthetic|미적인|a|art
affect|영향을 미치다|v|cause
aggressive|공격적인|a|emotion
allocate|할당하다|v|core
alter|바꾸다|v|change
ambiguous|모호한|a|quality
ambitious|야심 찬|a|emotion
analyze|분석하다|v|thought
ancient|고대의|a|time
anticipate|예상하다|v|thought
apparent|명백한|a|quality
appreciate|감사하다, 감상하다|v|emotion
approach|접근하다|v|core
appropriate|적절한|a|quality
approve|승인하다|v|core
arbitrary|임의의|a|quality
arise|발생하다|v|cause
articulate|분명히 말하다|v|argue
assemble|모으다, 조립하다|v|core
assert|주장하다|v|argue
assess|평가하다|v|thought
assign|배정하다|v|core
assume|가정하다|v|thought
assure|보장하다|v|argue
attain|달성하다|v|core
attribute|~의 탓으로 돌리다|v|cause
authentic|진짜의|a|quality
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
commence|시작하다|v|change
compensate|보상하다|v|society
compel|강요하다|v|cause
competent|유능한|a|quality
comply|따르다, 준수하다|v|society
comprehend|이해하다|v|thought
comprise|구성하다|v|core
conceal|숨기다|v|core
conceive|생각해 내다|v|thought
concentrate|집중하다|v|thought
conclude|결론짓다|v|argue
confine|제한하다|v|core
conform|순응하다|v|society
confront|직면하다|v|core
consensus|합의|n|society
consent|동의|n|society
consequence|결과|n|cause
conserve|보존하다|v|science
considerable|상당한|a|quality
consist|구성되다|v|core
constant|일정한|a|quality
constitute|구성하다|v|core
constrain|제약하다|v|core
consume|소비하다|v|society
contemporary|동시대의|a|time
contradict|모순되다|v|argue
contribute|기여하다|v|cause
controversy|논쟁|n|argue
convey|전달하다|v|argue
convince|설득하다|v|argue
cooperate|협력하다|v|society
correspond|일치하다, 서신을 주고받다|v|quality
credible|믿을 만한|a|quality
crucial|결정적인|a|quality
cultivate|경작하다, 기르다|v|science
curiosity|호기심|n|emotion
decline|감소하다, 거절하다|v|change
dedicate|헌신하다|v|emotion
deduce|추론하다|v|thought
deficiency|결핍|n|quality
definite|명확한|a|quality
deliberate|의도적인|a|thought
demonstrate|증명하다, 시위하다|v|argue
denote|나타내다|v|argue
deny|부인하다|v|argue
deprive|박탈하다|v|society
derive|유래하다, 얻어내다|v|cause
descend|내려가다|v|change
deteriorate|악화되다|v|change
determine|결정하다|v|thought
deviate|벗어나다|v|change
devote|바치다|v|emotion
diminish|감소하다|v|change
discard|버리다|v|core
discipline|규율, 학문 분야|n|society
discourage|낙담시키다|v|emotion
distinguish|구별하다|v|thought
distort|왜곡하다|v|change
distribute|분배하다|v|society
diverse|다양한|a|quality
dominate|지배하다|v|society
drastic|급격한|a|quality
dwell|거주하다|v|society
eliminate|제거하다|v|core
embrace|포용하다|v|emotion
emerge|나타나다|v|change
emphasize|강조하다|v|argue
empirical|경험적인|a|science
enhance|향상시키다|v|change
enormous|거대한|a|quality
ensure|보장하다|v|core
entail|수반하다|v|cause
equivalent|동등한|a|quality
essential|필수적인|a|quality
establish|설립하다|v|society
estimate|추정하다|v|thought
evaluate|평가하다|v|thought
evident|명백한|a|quality
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
feasible|실행 가능한|a|quality
fluctuate|변동하다|v|change
foster|촉진하다, 양육하다|v|cause
fundamental|근본적인|a|quality
generate|발생시키다|v|cause
genuine|진짜의|a|quality
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
indicate|나타내다|v|argue
indifferent|무관심한|a|emotion
inevitable|불가피한|a|quality
infer|추론하다|v|thought
inherent|내재된|a|quality
inhibit|억제하다|v|cause
initiate|개시하다|v|change
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
obscure|모호한|a|quality
obstacle|장애물|n|society
obtain|얻다|v|core
optimal|최적의|a|quality
outcome|결과|n|cause
overcome|극복하다|v|core
paradigm|패러다임, 전형|n|thought
perceive|인지하다|v|thought
persist|지속하다|v|change
perspective|관점|n|thought
persuade|설득하다|v|argue
phenomenon|현상|n|science
plausible|그럴듯한|a|quality
precise|정밀한|a|quality
predominant|지배적인|a|quality
preserve|보존하다|v|science
prevail|만연하다, 우세하다|v|society
prior|이전의|a|time
profound|심오한|a|thought
prohibit|금지하다|v|society
prominent|저명한, 두드러진|a|quality
prompt|촉발하다|v|cause
propose|제안하다|v|argue
pursue|추구하다|v|core
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
restrain|억제하다|v|core
retain|유지하다|v|core
retrieve|되찾다, 인출하다|v|thought
reveal|드러내다|v|argue
rigid|경직된|a|quality
scarce|부족한|a|quality
scrutiny|정밀 조사|n|thought
seek|추구하다|v|core
severe|심각한|a|quality
significant|중요한|a|quality
simultaneous|동시의|a|time
skeptical|회의적인|a|thought
speculate|추측하다|v|thought
spontaneous|자발적인|a|emotion
stable|안정적인|a|quality
stimulate|자극하다|v|cause
subjective|주관적인|a|thought
subsequent|그 다음의|a|time
substantial|상당한|a|quality
subtle|미묘한|a|quality
sufficient|충분한|a|quality
superficial|피상적인|a|thought
suppress|억압하다|v|society
surpass|능가하다|v|quality
sustain|지속하다|v|change
tempt|유혹하다|v|emotion
tendency|경향|n|quality
theoretical|이론적인|a|science
thorough|철저한|a|quality
thrive|번창하다|v|change
tolerate|참다, 용인하다|v|emotion
transform|변형시키다|v|change
transmit|전달하다|v|science
undergo|겪다|v|change
undermine|약화시키다|v|cause
uniform|균일한|a|quality
utilize|활용하다|v|core
valid|타당한|a|quality
vanish|사라지다|v|change
vary|다양하다|v|quality
verify|검증하다|v|science
vital|필수적인|a|quality
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
verify|확인하다|v|manage
waive|포기하다, 면제하다|v|legal
warehouse|창고|n|logistics
warranty|품질 보증|n|legal
wholesale|도매|n|trade
withdraw|인출하다, 철회하다|v|finance
workforce|노동력|n|hr
`;

/** 파이프 구분 텍스트 → 단어 객체 배열 */
export function parseWordList(text, deckId) {
  const out = [];
  const seen = new Set();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [en, ko, pos = '', tags = ''] = line.split('|').map((s) => (s || '').trim());
    if (!en || !ko) continue;
    // 같은 덱 안에서 철자가 겹치면(break/change 등 다의어) 뜻을 합쳐 id 충돌을 막는다
    const id = `${deckId}:${en.toLowerCase()}`;
    if (seen.has(id)) {
      const prev = out.find((w) => w.id === id);
      if (prev && !prev.ko.includes(ko)) prev.ko += `, ${ko}`;
      continue;
    }
    seen.add(id);
    out.push({
      id,
      en,
      ko,
      pos,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      deck: deckId,
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
