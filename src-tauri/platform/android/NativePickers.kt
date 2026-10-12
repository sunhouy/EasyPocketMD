package cn.yhsun.md

import android.app.Activity
import android.content.Context
import androidx.fragment.app.FragmentActivity
import com.google.android.material.datepicker.MaterialDatePicker
import com.google.android.material.timepicker.MaterialTimePicker
import com.google.android.material.timepicker.TimeFormat
import java.util.Calendar
import java.util.TimeZone

/** Material selectors preserve local calendar days when the picker uses UTC dates. */
object NativePickers {
    fun date(activity:Activity,context:Context,title:String,date:Calendar,session:NativeDialogSession,chosen:(Int,Int,Int)->Unit) {
        val owner=activity as? FragmentActivity ?: return
        if(owner.supportFragmentManager.isStateSaved)return
        val utc=Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {clear();set(date.get(Calendar.YEAR),date.get(Calendar.MONTH),date.get(Calendar.DAY_OF_MONTH))}
        val theme=NativeMaterial.theme(activity,NativeMaterial.night)
        val builder=MaterialDatePicker.Builder.datePicker().setTitleText(title).setSelection(utc.timeInMillis)
        if(theme!=0)builder.setTheme(theme)
        val picker=builder.build()
        picker.addOnPositiveButtonClickListener {millis->
            val value=Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {timeInMillis=millis}
            chosen(value.get(Calendar.YEAR),value.get(Calendar.MONTH),value.get(Calendar.DAY_OF_MONTH))
        }
        picker.showNow(owner.supportFragmentManager,"epmd-date")
        picker.dialog?.let {session.attach(it)}
    }
    fun time(activity:Activity,context:Context,title:String,date:Calendar,session:NativeDialogSession,chosen:(Int,Int)->Unit) {
        val owner=activity as? FragmentActivity ?: return
        if(owner.supportFragmentManager.isStateSaved)return
        val builder=MaterialTimePicker.Builder().setTitleText(title).setHour(date.get(Calendar.HOUR_OF_DAY)).setMinute(date.get(Calendar.MINUTE))
            .setTimeFormat(if(android.text.format.DateFormat.is24HourFormat(activity))TimeFormat.CLOCK_24H else TimeFormat.CLOCK_12H)
        val theme=NativeMaterial.theme(activity,NativeMaterial.night)
        if(theme!=0)builder.setTheme(theme)
        val picker=builder.build()
        picker.addOnPositiveButtonClickListener {chosen(picker.hour,picker.minute)}
        picker.showNow(owner.supportFragmentManager,"epmd-time")
        picker.dialog?.let {session.attach(it)}
    }
}
