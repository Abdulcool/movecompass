import React, { useEffect,useRef,useState } from "react";
import { ScrollView,Text,View } from "react-native";
import { exercises } from "@movecompass/pose";
import { BodyPicker } from "../../src/BodyPicker";
import { ExerciseCard } from "../../src/ExerciseCard";
import { Button, Card, Copy, Page, Title, s } from "../../src/ui";
export default function Plan() {
  const [region, setRegion] = useState(""),
    [goal, setGoal] = useState("");
  const scroll=useRef<React.ComponentRef<typeof ScrollView>>(null),[resultsY,setResultsY]=useState(0);
  useEffect(()=>{if(region && resultsY)scroll.current?.scrollTo({y:resultsY,animated:true});},[region,resultsY]);
  const filtered = exercises.filter(
    (e) => (!region || e.group === region) && (!goal || e.goal === goal),
  );
  return (
    <Page scrollRef={scroll}>
      <Text style={s.eyebrow}>MOVEMENT FOR YOUR DAY</Text>
      <Title>Your plan</Title>
      <Copy>Choose where you’d like a little support.</Copy>
      <Card>
        <Text style={s.heading}>Body area</Text>
        <BodyPicker value={region} onChange={setRegion} />
        <Text style={s.heading}>Care goal</Text>
        <View style={s.row}>
          {[
            ["stretch", "Stretch"],
            ["pain-relief", "Pain relief"],
            ["strength", "Strength"],
          ].map(([id, label]) => (
            <Button
              key={id}
              title={label}
              secondary={goal !== id}
              onPress={() => setGoal(goal === id ? "" : id)}
            />
          ))}
        </View>
        <Button
          title="Show all exercises"
          secondary
          onPress={() => {
            setGoal("");
            setRegion("");
          }}
        />
      </Card>
      <View onLayout={event=>setResultsY(event.nativeEvent.layout.y)}><Text style={s.heading}>Your exercises</Text>{filtered.map((e) => (
        <ExerciseCard key={e.id} exercise={e} />
      ))}
      {!filtered.length && (
        <Card>
          <Copy>
            Try another care goal or ask your CCCARE instructor for an adjusted
            dosage.
          </Copy>
        </Card>
      )}
      </View>
    </Page>
  );
}
